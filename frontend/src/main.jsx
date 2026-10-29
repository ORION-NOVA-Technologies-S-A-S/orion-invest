import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <UpdateBanner />
    <App />
  </React.StrictMode>
);
