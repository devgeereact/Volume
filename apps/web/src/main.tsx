import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Application } from "./app/Application";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element in index.html");

createRoot(root).render(
  <StrictMode>
    <Application />
  </StrictMode>,
);
