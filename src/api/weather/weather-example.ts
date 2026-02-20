/**
 * Example usage of the Weather API
 */

import { weatherController } from "./weather-controller"

async function demonstrateWeatherAPI() {
	console.log("Weather API Example Usage\n")

	try {
		// Example 1: Get weather by city name
		console.log("1. Getting weather by city name:")
		const cityWeather = await weatherController.getCurrentWeather({ city: "London" })
		console.log(`City: ${cityWeather.city}, ${cityWeather.country}`)
		console.log(
			`Temperature: ${cityWeather.temperature.temp}°${cityWeather.temperature.unit === "celsius" ? "C" : "F"}`,
		)
		console.log(`Description: ${cityWeather.description}`)
		console.log(`Humidity: ${cityWeather.humidity}%`)
		console.log("---\n")

		// Example 2: Get weather by coordinates
		console.log("2. Getting weather by coordinates:")
		const coordWeather = await weatherController.getCurrentWeather({
			lat: 40.7128,
			lon: -74.006,
		})
		console.log(`City: ${coordWeather.city}, ${coordWeather.country}`)
		console.log(
			`Temperature: ${coordWeather.temperature.temp}°${coordWeather.temperature.unit === "celsius" ? "C" : "F"}`,
		)
		console.log(`Description: ${coordWeather.description}`)
		console.log(`Wind Speed: ${coordWeather.wind_speed} m/s`)
		console.log("---\n")

		// Example 3: Validation examples
		console.log("3. Request validation examples:")

		const validCity = weatherController.validateRequest({ city: "Paris" })
		console.log("Valid city request:", validCity.isValid)

		const invalidCity = weatherController.validateRequest({ city: "" })
		console.log("Invalid city request:", invalidCity.isValid, "-", invalidCity.error)

		const validCoords = weatherController.validateRequest({ lat: 35.6762, lon: 139.6503 })
		console.log("Valid coordinates request:", validCoords.isValid)

		const invalidCoords = weatherController.validateRequest({ lat: 100, lon: 200 })
		console.log("Invalid coordinates request:", invalidCoords.isValid, "-", invalidCoords.error)
	} catch (error) {
		console.error("Error demonstrating weather API:", error instanceof Error ? error.message : "Unknown error")
	}
}

// Run the example if this file is executed directly
if (require.main === module) {
	demonstrateWeatherAPI()
}
