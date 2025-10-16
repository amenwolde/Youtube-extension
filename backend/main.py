# backend/main.py

import os, json, time, csv, hashlib, logging
from typing import List, Optional, Tuple

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

# ---------- Logging (console + CSV) ----------
logger = logging.getLogger("assist_backend")
if not logger.handlers:
    handler = logging.StreamHandler()
    fmt = logging.Formatter("[%(asctime)s] %(levelname)s: %(message)s")
    handler.setFormatter(fmt)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

LOGPATH = "logs/ask_log.csv"
os.makedirs(os.path.dirname(LOGPATH), exist_ok=True)

def log_row(row: dict):
    fields = ["ts","app","q","source","top_dist","retrieve_ms","gen_ms","answer_chars","total_ms"]
    exists = os.path.exists(LOGPATH)
    with open(LOGPATH, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        if not exists:
            w.writeheader()
        w.writerow(row)

# ---------- Timing helper ----------
def now_ms() -> float:
    return time.perf_counter() * 1000.0

# ---------- Embeddings ----------
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

class ChromaEmbedder:
    def __call__(self, input: List[str]) -> List[List[float]]:
        return embedding_model.encode(input).tolist()
    def name(self) -> str:
        return "sentence_transformer"

embedder = ChromaEmbedder()

# ---------- Persistent Chroma ----------
client = chromadb.PersistentClient(path="./chroma_store", settings=Settings())
collection = client.get_or_create_collection(
    name="assist_faqs",
    embedding_function=embedder,
    metadata={"hnsw:space": "cosine"}  # cosine distance: lower = closer
)

# ---------- HF model ----------
model_name = "google/flan-t5-small"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

# ---------- Schemas ----------
class FAQ(BaseModel):
    app: str
    question: str
    answer: str
    tags: Optional[List[str]] = None
    source: Optional[str] = None

class QuestionRequest(BaseModel):
    question: str
    app: Optional[str] = "YouTube"

class IngestPayload(BaseModel):
    faqs: List[FAQ]

# ---------- Ingest helpers ----------
def stable_qid(app: str, question: str) -> str:
    h = hashlib.sha1(f"{app}::{question}".encode("utf-8")).hexdigest()
    return f"{app}:{h}"

def upsert_faqs(faqs: List[FAQ]) -> int:
    ids, docs, metas = [], [], []
    for f in faqs:
        ids.append(stable_qid(f.app, f.question))
        docs.append(f.question)
        metas.append({
            "app": f.app,
            "answer": f.answer,
            **({"source": str(f.source)} if f.source is not None else {}),
            **({"tags": list(f.tags)} if f.tags is not None else {}),
        })
    collection.upsert(ids=ids, documents=docs, metadatas=metas)
    return len(ids)

def maybe_ingest_from_file(path: str = "faqs.json") -> int:
    if not os.path.exists(path):
        return 0
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    return upsert_faqs([FAQ(**x) for x in payload.get("faqs", [])])

ingested = maybe_ingest_from_file()
if ingested:
    logger.info(f"Ingested {ingested} FAQs from faqs.json")

# ---------- Retrieval / Generation ----------
SIM_THRESHOLD = 0.12  # cosine distance: lower = closer

def retrieve(query: str, app: Optional[str], k: int = 5) -> List[Tuple[str, dict, float]]:
    where = {"app": app} if app else None
    res = collection.query(
        query_texts=[query],
        n_results=k,
        where=where,
        include=["documents", "metadatas", "distances"]
    )
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]
    return list(zip(docs, metas, dists))

def build_prompt(query: str, retrieved: List[Tuple[str, dict, float]]) -> str:
    app_name = retrieved[0][1].get("app", "the app") if retrieved else "the app"
    ctx = "\n\n".join([f"Q: {q}\nA: {m.get('answer','')}" for q, m, _ in retrieved])
    return (
        f"You are a helpful assistant for {app_name} users.\n"
        f"Answer the question using ONLY the context if possible. Be concise.\n\n"
        f"Context:\n{ctx}\n\n"
        f"User question:\n{query}\n\n"
        f"Final answer:"
    )

def generate_answer(prompt: str) -> str:
    input_ids = tokenizer(prompt, return_tensors="pt").input_ids
    outputs = model.generate(input_ids, max_new_tokens=120)
    return tokenizer.decode(outputs[0], skip_special_tokens=True).strip()

# ---------- FastAPI ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

@app.post("/ask")
async def ask_question(req: QuestionRequest):
    t_start = now_ms()

    # 1) Retrieval timing
    t0 = now_ms()
    retrieved = retrieve(req.question, req.app, k=5)
    t1 = now_ms()
    retrieve_ms = t1 - t0

    # Defaults
    top_dist = None
    path = "rag" if retrieved else "llm"
    answer = ""
    gen_ms = 0.0

    # 2) If strong nearest neighbor → direct retrieval answer
    if retrieved:
        top_q, top_meta, top_dist = retrieved[0]
        if top_dist is not None and top_dist <= SIM_THRESHOLD and "answer" in top_meta:
            answer = top_meta["answer"]
            path = "retrieval"
            total_ms = now_ms() - t_start
            
            # ---- console print ----
            logger.info(
                f"/ask path={path} app={req.app} dist={top_dist:.4f} "
                f"retrieve_ms={retrieve_ms:.2f} gen_ms={gen_ms:.2f} total_ms={total_ms:.2f} "
                f"q='{req.question[:120]}'"
            )

            # ---- CSV log ----
            log_row({
                "ts": time.time(),
                "app": req.app,
                "q": req.question,
                "source": path,
                "top_dist": top_dist,
                "retrieve_ms": round(retrieve_ms, 2),
                "gen_ms": round(gen_ms, 2),
                "answer_chars": len(answer),
                "total_ms": round(total_ms, 2),
            })

            return {
                "answer": answer,
                "path": path,
                "distance": top_dist,
                "retrieve_ms": round(retrieve_ms, 2),
                "gen_ms": round(gen_ms, 2),
                "total_ms": round(total_ms, 2),
            }

    # 3) Otherwise use LLM (RAG if we have retrieved context, else plain LLM)
    prompt = build_prompt(req.question, retrieved) if retrieved else req.question

    t2 = now_ms()
    answer = generate_answer(prompt)
    t3 = now_ms()
    gen_ms = t3 - t2
    total_ms = now_ms() - t_start

    # ---- console print ----
    logger.info(
        f"/ask path={path} app={req.app} top_dist={top_dist if top_dist is not None else 'NA'} "
        f"retrieve_ms={retrieve_ms:.2f} gen_ms={gen_ms:.2f} total_ms={total_ms:.2f} "
        f"q='{req.question[:120]}'"
    )

    # ---- CSV log ----
    log_row({
        "ts": time.time(),
        "app": req.app,
        "q": req.question,
        "source": path,            # "rag" or "llm"
        "top_dist": top_dist,
        "retrieve_ms": round(retrieve_ms, 2),
        "gen_ms": round(gen_ms, 2),
        "answer_chars": len(answer),
        "total_ms": round(total_ms, 2),
    })

    return {
        "answer": answer,
        "path": path,              # "rag" or "llm"
        "top_distance": top_dist,
        "retrieve_ms": round(retrieve_ms, 2),
        "gen_ms": round(gen_ms, 2),
        "total_ms": round(total_ms, 2),
    }

@app.post("/ingest")
async def ingest(payload: IngestPayload):
    n = upsert_faqs(payload.faqs)
    logger.info(f"/ingest count={n}")
    return {"status": "ok", "count": n}

# (optional) quick health check
@app.get("/health")
async def health():
    return {"ok": True}
