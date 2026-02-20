/**
 * Weather controller for handling API requests
 */

import { weatherService } from "./weather-service"
import { WeatherRequest, SimpleWeatherResponse } from "./weather-types"

export class WeatherController {
	/**
	 * Get current weather data
	 * @param request Weather request parameters
	 * @returns Simplified weather response
	 */
	async getCurrentWeather(request: WeatherRequest): Promise<SimpleWeatherResponse> {
		try {
			let weatherData

			if (request.city) {
				weatherData = await weatherService.getCurrentWeatherByCity(request.city)
			} else if (request.lat !== undefined && request.lon !== undefined) {
				weatherData = await weatherService.getCurrentWeatherByCoordinates(request.lat, request.lon)
			} else {
				throw new Error("Either city name or coordinates must be provided")
			}

			return weatherService.getSimplifiedWeatherResponse(weatherData)
		} catch (error) {
			throw new Error(
				`Failed to retrieve weather data: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Validate weather request parameters
	 * @param request Weather request parameters
	 * @returns Validation result
	 */
	validateRequest(request: WeatherRequest): { isValid: boolean; error?: string } {
		if (request.city && request.city.trim().length === 0) {
			return { isValid: false, error: "City name cannot be empty" }
		}

		if (request.lat !== undefined || request.lon !== undefined) {
			if (request.lat === undefined || request.lon === undefined) {
				return { isValid: false, error: "Both latitude and longitude must be provided" }
			}

			if (request.lat < -90 || request.lat > 90) {
				return { isValid: false, error: "Latitude must be between -90 and 90 degrees" }
			}

			if (request.lon < -180 || request.lon > 180) {
				return { isValid: false, error: "Longitude must be between -180 and 180 degrees" }
			}
		}

		if (!request.city && (request.lat === undefined || request.lon === undefined)) {
			return { isValid: false, error: "Either city name or coordinates must be provided" }
		}

		return { isValid: true }
	}
}

// Export singleton instance
export const weatherController = new WeatherController()
