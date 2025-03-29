import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class names and applies Tailwind's merge logic
 * Used by shadcn/ui components for class name handling
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}