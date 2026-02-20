/**
 * Weather service for interacting with the OpenWeatherMap API
 */

import axios, { AxiosInstance, AxiosError } from "axios"
import { WeatherData, WeatherRequest, SimpleWeatherResponse, TemperatureData } from "./weather-types"
import { WeatherConfig, getWeatherConfig } from "./weather-config"

export class WeatherService {
	private axiosInstance: AxiosInstance
	private config: WeatherConfig

	constructor() {
		this.config = getWeatherConfig()
		this.axiosInstance = axios.create({
			baseURL: this.config.baseUrl,
			timeout: 10000,
			params: {
				appid: this.config.apiKey,
				units: this.config.units,
			},
		})

		// Add response interceptor for error handling
		this.axiosInstance.interceptors.response.use(
			(response) => response,
			(error: AxiosError) => {
				if (error.response) {
					// Server responded with error status
					throw new Error(`Weather API error: ${error.response.status} - ${error.response.statusText}`)
				} else if (error.request) {
					// Network error
					throw new Error("Network error occurred while fetching weather data")
				} else {
					// Other error
					throw new Error("An error occurred while setting up the weather request")
				}
			},
		)
	}

	/**
	 * Fetch current weather data by city name
	 * @param city City name
	 * @returns Weather data
	 */
	async getCurrentWeatherByCity(city: string): Promise<WeatherData> {
		try {
			const response = await this.axiosInstance.get("/weather", {
				params: {
					q: city,
				},
			})
			return response.data
		} catch (error) {
			throw this.handleError(error, `Failed to fetch weather for city: ${city}`)
		}
	}

	/**
	 * Fetch current weather data by coordinates
	 * @param lat Latitude
	 * @param lon Longitude
	 * @returns Weather data
	 */
	async getCurrentWeatherByCoordinates(lat: number, lon: number): Promise<WeatherData> {
		try {
			const response = await this.axiosInstance.get("/weather", {
				params: {
					lat: lat,
					lon: lon,
				},
			})
			return response.data
		} catch (error) {
			throw this.handleError(error, `Failed to fetch weather for coordinates: ${lat}, ${lon}`)
		}
	}

	/**
	 * Get simplified weather response with essential data
	 * @param weatherData Raw weather data from API
	 * @returns Simplified weather response
	 */
	getSimplifiedWeatherResponse(weatherData: WeatherData): SimpleWeatherResponse {
		const temperature: TemperatureData = {
			temp: weatherData.main.temp,
			feels_like: weatherData.main.feels_like,
			temp_min: weatherData.main.temp_min,
			temp_max: weatherData.main.temp_max,
			unit: this.config.units === "metric" ? "celsius" : "fahrenheit",
		}

		return {
			city: weatherData.name,
			country: weatherData.sys.country,
			temperature,
			description: weatherData.weather[0]?.description || "Unknown",
			humidity: weatherData.main.humidity,
			pressure: weatherData.main.pressure,
			visibility: weatherData.visibility,
			wind_speed: weatherData.wind.speed,
		}
	}

	/**
	 * Handle errors from API calls
	 * @param error Error object
	 * @param defaultMessage Default error message
	 * @returns Formatted error message
	 */
	private handleError(error: any, defaultMessage: string): Error {
		if (error instanceof Error) {
			// Check for specific API error responses
			if (error.message.includes("401")) {
				return new Error("Invalid API key for OpenWeatherMap service")
			} else if (error.message.includes("404")) {
				return new Error("City not found in OpenWeatherMap database")
			} else if (error.message.includes("429")) {
				return new Error("API rate limit exceeded for OpenWeatherMap service")
			}
			return error
		}
		return new Error(defaultMessage)
	}
}

// Export singleton instance
export const weatherService = new WeatherService()
