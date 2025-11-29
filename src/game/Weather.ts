import type { WeatherConfig, WeatherType } from './types';

export const WEATHER_PRESETS: Record<WeatherType, WeatherConfig> = {
    calm: {
        name: 'Calm',
        windRange: 5,
        changeRate: 0.01,
        dampening: 1.0
    },
    breezy: {
        name: 'Breezy',
        windRange: 15,
        changeRate: 0.02,
        dampening: 2.0
    },
    stormy: {
        name: 'Stormy',
        windRange: 35,
        changeRate: 0.1,
        dampening: 5.0
    }
};
