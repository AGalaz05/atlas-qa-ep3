import { api } from "./api";
import { toast } from "sonner";

// Usa el interceptor de Axios existente para enviar el JWT.
export async function abrirContrato(id) {
  const pestana = window.open("about:blank", "_blank");
  if (pestana) pestana.opener = null;
  let url;

  try {
    const { data } = await api.get(`/contratos/${encodeURIComponent(id)}/file`, {
      responseType: "blob",
    });

    // El endpoint entrega documentos PDF; no abrir contenido de otro tipo.
    const firma = await data.slice(0, 5).text();
    if (firma !== "%PDF-") {
      throw new Error("El archivo recibido no es un PDF válido.");
    }

    url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));

    if (pestana && !pestana.closed) {
      pestana.location.replace(url);
    } else {
      // Alternativa cuando el navegador bloquea ventanas emergentes.
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `contrato-${id}.pdf`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
    }

    const urlTemporal = url;
    window.setTimeout(() => URL.revokeObjectURL(urlTemporal), 120000);
  } catch (error) {
    if (pestana && !pestana.closed) pestana.close();
    if (url) URL.revokeObjectURL(url);
    // Axios ya notifica los errores HTTP mediante su interceptor.
    if (!error.isAxiosError) {
      toast.error(error.message || "No se pudo abrir el contrato.");
    }
  }
}
