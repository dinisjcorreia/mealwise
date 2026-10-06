import { MAX_MEAL_PHOTO_BYTES } from "./shared/photos";

export async function prepareMealPhoto(file: File): Promise<File> {
  const image = await createImageBitmap(file).catch(() => {
    throw new Error("Não foi possível abrir a foto. Escolhe uma imagem JPEG, PNG ou WebP.");
  });
  try {
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.6, 0.4]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob?.size && blob.size <= MAX_MEAL_PHOTO_BYTES) {
        return new File([blob], "meal.jpg", { type: "image/jpeg" });
      }
    }
    throw new Error("A foto continua demasiado grande. Escolhe uma imagem mais pequena.");
  } finally {
    image.close();
  }
}
