const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PDF_COLOR_VARIABLES: Record<string, string> = {
  "--background": "#ffffff",
  "--foreground": "#000000",
  "--card": "#ffffff",
  "--card-foreground": "#000000",
  "--popover": "#ffffff",
  "--popover-foreground": "#000000",
  "--primary": "#000000",
  "--primary-foreground": "#ffffff",
  "--secondary": "#ffffff",
  "--secondary-foreground": "#000000",
  "--muted": "#ffffff",
  "--muted-foreground": "#000000",
  "--accent": "#ffffff",
  "--accent-foreground": "#000000",
  "--destructive": "#000000",
  "--destructive-foreground": "#ffffff",
  "--border": "#000000",
  "--input": "#000000",
  "--ring": "#000000",
};

export async function downloadCvPdf(container: HTMLElement, filename: string): Promise<void> {
  const pages = Array.from(container.querySelectorAll<HTMLElement>("[data-cv-page]"));
  if (pages.length === 0) throw new Error("CV preview is not ready");

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const pdf = new jsPDF({
    format: "a4",
    orientation: "portrait",
    unit: "mm",
  });

  for (const [index, page] of pages.entries()) {
    const canvas = await html2canvas(page, {
      backgroundColor: "#ffffff",
      logging: false,
      onclone: (document, element) => {
        document.documentElement.classList.remove("dark");
        for (const [property, value] of Object.entries(PDF_COLOR_VARIABLES)) {
          document.documentElement.style.setProperty(property, value);
          document.body.style.setProperty(property, value);
          element.style.setProperty(property, value);
        }
        document.documentElement.style.backgroundColor = "#ffffff";
        document.body.style.backgroundColor = "#ffffff";
        element.style.backgroundColor = "#ffffff";
        element.style.color = "#000000";
      },
      scale: 2,
      useCORS: true,
    });
    if (index > 0) pdf.addPage("a4", "portrait");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
  }

  pdf.save(filename);
}

export function cvPdfFilename(name: string, company: string, position: string): string {
  return `${filenamePart(name)}_${filenamePart(company)}_${filenamePart(position)}.pdf`;
}

function filenamePart(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_");
  return normalized || "unknown";
}
