import type { ExperienceType } from "./domain";

export const SEARCH_LENSES: Record<ExperienceType, string[]> = {
  iconic: ["iconic attractions", "famous landmarks"],
  history: ["historic sites", "history museums", "historic neighborhoods"],
  local_life: ["traditional markets", "local neighborhoods", "independent shops"],
  art: ["art museums", "art galleries", "design districts"],
  nature: ["parks", "gardens", "waterfront walks"],
  food: ["local food markets", "traditional restaurants"],
  architecture: ["historic architecture", "modern architecture"],
};

export const EXPERIENCE_TYPES = Object.keys(SEARCH_LENSES) as ExperienceType[];
