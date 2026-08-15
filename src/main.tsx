import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installAuthTokenResilience } from "@/lib/auth-token";
import { registerServiceWorker } from "@/pwa/register-sw";
import { installStackedTableLabels } from "@/lib/stacked-tables";

installAuthTokenResilience();
registerServiceWorker();
installStackedTableLabels();

createRoot(document.getElementById("root")!).render(<App />);
