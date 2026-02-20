/**
 * Configuration for the OpenWeatherMap API integration
 */

export interface WeatherConfig {
	apiKey: string
	baseUrl: string
	units: "metric" | "imperial"
}

// Default configuration with placeholder API key
export const defaultWeatherConfig: WeatherConfig = {
	apiKey: "OPENWEATHERMAP_API_KEY_PLACEHOLDER", // Replace with actual API key
	baseUrl: "https://api.openweathermap.org/data/2.5",
	units: "metric",
}

// Get configuration from environment variables or use defaults
export function getWeatherConfig(): WeatherConfig {
	return {
		apiKey: process.env.OPENWEATHERMAP_API_KEY || defaultWeatherConfig.apiKey,
		baseUrl: process.env.OPENWEATHERMAP_BASE_URL || defaultWeatherConfig.baseUrl,
		units: (process.env.OPENWEATHERMAP_UNITS as "metric" | "imperial") || defaultWeatherConfig.units,
	}
}
