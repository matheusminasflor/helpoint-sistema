import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErroDaTela } from "./components/ErroDaTela";
import { recarregarUmaVez } from "./lib/versao-nova";
import "./index.css";

// O Vite avisa quando um pedaço de tela pré-carregado não veio (versão nova publicada com a
// página aberta): recarrega uma vez em vez de deixar a tela branca (2026-10-06).
window.addEventListener("vite:preloadError", (evento) => {
  if (recarregarUmaVez()) evento.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErroDaTela>
      <App />
    </ErroDaTela>
  </React.StrictMode>
);
