
import { fetchConfig } from './config';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export const searchFundData = async (isin: string): Promise<SearchResult | null> => {
  const config = await fetchConfig();
  const apiKey = config.serpApiKey;
  
  if (!apiKey) {
    console.error('Missing SERPAPI_API_KEY in user config');
    return null;
  }

  const cleanIsin = isin.trim();
  
  const params = new URLSearchParams({
    engine: "google",
    q: `quantalys ${cleanIsin}`,
    hl: "fr",
    gl: "fr",
    google_domain: "google.fr",
    api_key: apiKey
  });

  const url = `/serpapi/search?${params.toString()}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`SerpApi error: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.organic_results && data.organic_results.length > 0) {
      const firstResult = data.organic_results[0];
      return {
        title: firstResult.title,
        link: firstResult.link,
        snippet: firstResult.snippet
      };
    }
  } catch (error) {
    console.error(`Erreur lors de la recherche du fonds ${cleanIsin}:`, error);
  }

  return null;
};
