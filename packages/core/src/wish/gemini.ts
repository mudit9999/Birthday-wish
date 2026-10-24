import { GoogleGenAI } from '@google/genai'
import type { WishModel } from './generate.js'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

const TEMPERATURE = 0.9

export function createGeminiModel(opts: { apiKey: string; model: string }): WishModel {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })
  return {
    async generate({ system, prompt }) {
      const response = await ai.models.generateContent({
        model: opts.model,
        contents: prompt,
        config: { systemInstruction: system, temperature: TEMPERATURE }
      })
      return response.text ?? ''
    }
  }
}
