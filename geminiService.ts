
import { GoogleGenAI, Type } from "@google/genai";
import { Analysis, DailyPlan, FlowMode } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export const analyzeBrainDump = async (
  content: string, 
  mode: FlowMode
): Promise<Analysis> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this brain dump for a person in ${mode} mode: "${content}"`,
    config: {
      systemInstruction: `You are a high-performance neural coach. Your goal is to analyze user thoughts and provide evidence-based insights. 
      Use Google Search to find current productivity or mental wellness research relevant to their specific stressors mentioned.
      Return grounded, actionable advice in JSON format.`,
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mood: { type: Type.STRING },
          energyLevel: { type: Type.NUMBER },
          suggestedTasks: { type: Type.ARRAY, items: { type: Type.STRING } },
          coachingAdvice: { type: Type.STRING },
          burnoutRisk: { type: Type.BOOLEAN },
          focusInsight: { type: Type.STRING }
        },
        required: ["mood", "energyLevel", "suggestedTasks", "coachingAdvice", "burnoutRisk", "focusInsight"]
      }
    }
  });

  const rawJson = JSON.parse(response.text || "{}");
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  
  const groundingSources = groundingChunks?.map((chunk: any) => ({
    title: chunk.web?.title || "Research Source",
    uri: chunk.web?.uri || "#"
  })).filter((s: any) => s.uri !== "#") || [];

  return {
    ...rawJson,
    groundingSources
  };
};

export const generatePlan = async (
  analysis: Analysis, 
  mode: FlowMode
): Promise<Partial<DailyPlan>> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create a daily schedule for energy level ${analysis.energyLevel} and mode ${mode}. 
    Tasks: ${analysis.suggestedTasks.join(', ')}. 
    Assign a priority (high, medium, low) to each task.`,
    config: {
      systemInstruction: "You are a master of time-blocking. Structure the day for peak cognitive efficiency. Ensure breaks are included.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                duration: { type: Type.NUMBER },
                isBreak: { type: Type.BOOLEAN },
                energyRequired: { type: Type.NUMBER },
                priority: { type: Type.STRING, enum: ["high", "medium", "low"] }
              },
              required: ["title", "duration", "isBreak", "energyRequired", "priority"]
            }
          }
        },
        required: ["tasks"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};
