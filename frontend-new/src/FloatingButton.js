import React from "react";
import { FaQuestionCircle } from "react-icons/fa"; // Optional: install with `npm install react-icons`

const FloatingButton = ({ onClick }) => {
  return (
    <div style={buttonStyle} onClick={onClick}>
      <FaQuestionCircle size={24} />
    </div>
  );
};

const buttonStyle = {
  position: "fixed",
  bottom: 20,
  right: 20,
  backgroundColor: "#007bff",
  color: "white",
  borderRadius: "50%",
  width: 56,
  height: 56,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  cursor: "pointer",
  boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
  zIndex: 9999,
};

export default FloatingButton;
