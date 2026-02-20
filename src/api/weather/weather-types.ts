/**
 * Weather data types for the OpenWeatherMap API integration
 */

export interface WeatherData {
	coord: {
		lon: number
		lat: number
	}
	weather: Array<{
		id: number
		main: string
		description: string
		icon: string
	}>
	base: string
	main: {
		temp: number
		feels_like: number
		temp_min: number
		temp_max: number
		pressure: number
		humidity: number
		sea_level?: number
		grnd_level?: number
	}
	visibility: number
	wind: {
		speed: number
		deg: number
		gust?: number
	}
	clouds: {
		all: number
	}
	dt: number
	sys: {
		type: number
		id: number
		country: string
		sunrise: number
		sunset: number
	}
	timezone: number
	id: number
	name: string
	cod: number
}

export interface WeatherRequest {
	city?: string
	lat?: number
	lon?: number
}

export interface TemperatureData {
	temp: number
	feels_like: number
	temp_min: number
	temp_max: number
	unit: "celsius" | "fahrenheit"
}

export interface SimpleWeatherResponse {
	city: string
	country: string
	temperature: TemperatureData
	description: string
	humidity: number
	pressure: number
	visibility: number
	wind_speed: number
}
