import type { TradingAsset } from "@/lib/domain/types";

export const NUGGETS_PER_STAR = 1000;

export const TRADING_ASSETS: TradingAsset[] = [
  { symbol: "CHOMP", name: "Chomp Snacks Co.", emoji: "🍿", industry: "Snack food", basePriceNuggets: 45, paysDividend: true, description: "Chomp Snacks makes the world's most popular crisps and snack packs, sold in every school canteen." },
  { symbol: "ZAPP",  name: "Zapp Gaming",       emoji: "🎮", industry: "Video games", basePriceNuggets: 85, paysDividend: false, description: "Zapp Gaming makes the hottest consoles and apps that kids play every day worldwide." },
  { symbol: "ZOOM",  name: "Zoom Wheels",        emoji: "🛴", industry: "Scooters & bikes", basePriceNuggets: 30, paysDividend: false, description: "Zoom Wheels builds the fastest scooters and bikes that kids zoom around on after school." },
  { symbol: "FLICK", name: "Flick Studios",      emoji: "🎬", industry: "Movies & streaming", basePriceNuggets: 120, paysDividend: true, description: "Flick Studios produces blockbuster movies and the streaming service every family subscribes to." },
  { symbol: "PAWZ",  name: "Pawz Pet Co.",        emoji: "🐾", industry: "Pet toys & food", basePriceNuggets: 25, paysDividend: true, description: "Pawz Pet Co. makes all the best toys and treats to keep your pets happy and healthy." },
  { symbol: "BLAST", name: "Blast Sports",        emoji: "⚽", industry: "Sports equipment", basePriceNuggets: 55, paysDividend: false, description: "Blast Sports supplies the gear for every sport — from boots to helmets to water bottles." },
  { symbol: "YUMM",  name: "Yumm Burgers",        emoji: "🍔", industry: "Fast food", basePriceNuggets: 40, paysDividend: true, description: "Yumm Burgers is the burger chain with the secret sauce that makes everyone come back for more." },
  { symbol: "SPARK", name: "Spark Gadgets",       emoji: "💡", industry: "Tech gadgets", basePriceNuggets: 95, paysDividend: false, description: "Spark Gadgets invents the coolest tech toys and smart home devices that feel like magic." },
  { symbol: "SPLASH",name: "Splash Parks",        emoji: "🌊", industry: "Theme parks", basePriceNuggets: 70, paysDividend: false, description: "Splash Parks runs the biggest water parks and theme parks where families spend their holidays." },
  { symbol: "SWEET", name: "Sweet Street",        emoji: "🍭", industry: "Candy & sweets", basePriceNuggets: 20, paysDividend: true, description: "Sweet Street creates all the lollies, gummies, and chocolates that fill every trick-or-treat bag." },
];
