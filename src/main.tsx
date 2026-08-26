import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installAuthTokenResilience } from "@/lib/auth-token";
import { registerServiceWorker } from "@/pwa/register-sw";
import { installStackedTableLabels } from "@/lib/stacked-tables";
import { installGlobalErrorHandlers } from "@/lib/errorLog";

// First, so anything the other installers throw is already being recorded.
installGlobalErrorHandlers();
installAuthTokenResilience();
registerServiceWorker();
installStackedTableLabels();

createRoot(document.getElementById("root")!).render(<App />);
