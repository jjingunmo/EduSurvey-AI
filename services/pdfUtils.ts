// Declare global variable for pdfjsLib provided via script tag
declare const pdfjsLib: any;

export const convertFileToBase64 = (file: File): Promise<string[]> => {
  return new Promise(async (resolve, reject) => {
    try {
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const images: string[] = [];

        // PROCESS ALL PAGES: 1 Page = 1 Person Rule
        const pagesToProcess = pdf.numPages;

        for (let i = 1; i <= pagesToProcess; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (!context) throw new Error('Canvas context not available');

          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;

          // Get base64 string (remove data:image/png;base64, prefix for Gemini)
          const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
          images.push(base64);
        }
        resolve(images);
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve([result.split(',')[1]]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } else {
        reject(new Error('Unsupported file type'));
      }
    } catch (error) {
      reject(error);
    }
  });
};
