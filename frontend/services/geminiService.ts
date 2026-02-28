
import { GoogleGenAI, Type } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getInventoryInsights = async (inventoryData: any) => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze the following inventory data and provide top 3 actionable insights for Kore Kollective's distribution manager. Focus on stock availability, potential shortages, and replenishment needs: ${JSON.stringify(inventoryData)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              insight: { type: Type.STRING },
              action: { type: Type.STRING },
              priority: { type: Type.STRING }
            },
            required: ['insight', 'action', 'priority']
          }
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return [];
  }
};
