import { GoogleGenAI, Type } from "@google/genai";
import { SurveyItem } from "../types";

const PROMPT = `
You are an expert OCR and data extraction assistant for Korean education satisfaction surveys.
Analyze the provided image(s) of a handwritten survey.

Task:
1. **Extract the Main Title**: Identify the specific name of the education/training program (교육명) usually found at the very top of the page in large text (e.g., "2024년 신입사원 연수", "리더십 강화 과정", "직무 교육 만족도 조사").
2. **Identify Questions**: Find the list of questions (rows).
3. **Categorize**: For each question, categorize it into:
   - '교육기획평가' (Planning)
   - '교육환경평가' (Environment)
   - '강사평가' (Instructor)
   - '프로그램 성과평가' (Outcome)
   - '기타' (Other)
4. **Extract Score**: Identify which satisfaction column is marked (check/circle).
   - '매우만족' (5), '만족' (4), '보통' (3), '불만' (2), '매우불만' (1).

Return the data in JSON format containing the 'title' and the list of 'items'.
If the title is not clearly visible, return an empty string for title.
If no marks are found, return an empty items array.
`;

interface AnalysisResult {
  title: string;
  items: SurveyItem[];
}

export const analyzeSurveyImage = async (base64Images: string[]): Promise<AnalysisResult> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found");

    const ai = new GoogleGenAI({ apiKey });

    const parts = base64Images.map(img => ({
      inlineData: {
        mimeType: 'image/jpeg',
        data: img
      }
    }));

    // Add text prompt
    parts.push({
        // @ts-ignore
        text: PROMPT
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: parts as any 
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "The name of the education or survey title found at the top." },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING, description: "The text of the survey question" },
                  category: { 
                    type: Type.STRING, 
                    enum: ['교육기획평가', '교육환경평가', '강사평가', '프로그램 성과평가', '기타'],
                    description: "The category of the question" 
                  },
                  score: { type: Type.NUMBER, description: "Score from 5 (Very Satisfied) to 1 (Very Dissatisfied)" },
                  label: { 
                    type: Type.STRING, 
                    enum: ['매우만족', '만족', '보통', '불만', '매우불만'],
                    description: "The label corresponding to the score"
                  }
                },
                required: ["question", "category", "score", "label"]
              }
            }
          },
          required: ["items"]
        }
      }
    });

    const text = response.text;
    if (!text) return { title: "", items: [] };

    return JSON.parse(text) as AnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};