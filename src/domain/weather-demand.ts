export type WeatherWindow = "past-7" | "current-week" | "forward-7";

export const WEATHER_WINDOWS: WeatherWindow[] = ["past-7", "current-week", "forward-7"];

export interface WeatherFeatures {
  heatIndex?: number;
  freezeThaw?: boolean;
  humidity?: number;
  heavyRain?: boolean;
  severeWind?: boolean;
  extremeEvent?: boolean;
}

export interface BranchWeatherState {
  branchId: string;
  windows: Record<WeatherWindow, WeatherFeatures>;
}

export interface LunarFeature {
  experimental: true;
  assumedCausesLeaks: false;
  weight: number;
  earnedLift: boolean;
}

/** Lunar phase is never assumed to cause residential leaks. Weight is 0 unless lift is earned after confounders. */
export function lunarPlumbingFeature(earnedLift: boolean, rawWeight: number): LunarFeature {
  return {
    experimental: true,
    assumedCausesLeaks: false,
    earnedLift,
    weight: earnedLift ? Math.max(0, rawWeight) : 0
  };
}

export function lunarWeightWithoutEarnedLift(): 0 {
  return 0;
}

export function synchronizedWindows(state: BranchWeatherState): WeatherWindow[] {
  for (const window of WEATHER_WINDOWS) {
    if (!(window in state.windows)) {
      throw new Error("branch weather windows must stay synchronized: past-7, current-week, forward-7");
    }
  }
  return [...WEATHER_WINDOWS];
}

export function demandForecast(input: {
  baseVolume: number;
  features: WeatherFeatures;
  lunar?: LunarFeature;
}): { volume: number; uncertainty: number; extremeEvent: boolean; eventSpecificMix: boolean } {
  const extremeEvent = Boolean(input.features.extremeEvent);
  if (extremeEvent) {
    return {
      volume: input.baseVolume,
      uncertainty: 0.45,
      extremeEvent: true,
      eventSpecificMix: true
    };
  }
  let volume = input.baseVolume;
  if (input.features.heatIndex && input.features.heatIndex >= 95) volume *= 1.35;
  if (input.features.heavyRain) volume *= 1.15;
  if (input.lunar) volume *= 1 + input.lunar.weight;
  return { volume, uncertainty: 0.15, extremeEvent: false, eventSpecificMix: false };
}

export function reconcileForecast(predicted: number, actual: number): { error: number } {
  return { error: actual - predicted };
}
