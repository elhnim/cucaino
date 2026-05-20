import type { TradingAsset } from "@/lib/domain/types";

export const NUGGETS_PER_STAR = 1000;

export const TRADING_ASSETS: TradingAsset[] = [
  { symbol: "MOON",  name: "Moonbucks",           emoji: "☕", industry: "Coffee & drinks",     basePriceNuggets: 50,  paysDividend: true,  dividendDayOfWeek: 1, dividendPct: 0.004, description: "Moonbucks is the coffee shop on every corner where parents grab their morning brew and kids get hot chocolate." },
  { symbol: "ZAPP",  name: "Zapp Gaming",          emoji: "🎮", industry: "Video games",         basePriceNuggets: 85,  paysDividend: false, description: "Zapp Gaming makes the hottest consoles and apps that kids play every day worldwide." },
  { symbol: "TZLA",  name: "Tezla",                emoji: "⚡", industry: "Electric vehicles",   basePriceNuggets: 80,  paysDividend: false, description: "Tezla builds super-fast electric cars and rockets that make the future look like a sci-fi movie." },
  { symbol: "FLICK", name: "Flick Studios",        emoji: "🎬", industry: "Movies & streaming",  basePriceNuggets: 120, paysDividend: true,  dividendDayOfWeek: 4, dividendPct: 0.003, description: "Flick Studios produces blockbuster movies and the streaming service every family subscribes to." },
  { symbol: "PMRK",  name: "Pop Mark",             emoji: "🎁", industry: "Collectible toys",    basePriceNuggets: 35,  paysDividend: false, description: "Pop Mark makes the mystery-box collectible figures that kids trade in the playground every day." },
  { symbol: "BLAST", name: "Blast Sports",         emoji: "⚽", industry: "Sports equipment",    basePriceNuggets: 55,  paysDividend: false, description: "Blast Sports supplies the gear for every sport — from boots to helmets to water bottles." },
  { symbol: "YUMM",  name: "Yumm Burgers",         emoji: "🍔", industry: "Fast food",           basePriceNuggets: 40,  paysDividend: true,  dividendDayOfWeek: 3, dividendPct: 0.0035, description: "Yumm Burgers is the burger chain with the secret sauce that makes everyone come back for more." },
  { symbol: "SPARK", name: "Spark Gadgets",        emoji: "💡", industry: "Tech gadgets",        basePriceNuggets: 95,  paysDividend: false, description: "Spark Gadgets invents the coolest tech toys and smart home devices that feel like magic." },
  { symbol: "DYSN",  name: "Dysnei",               emoji: "🏰", industry: "Theme parks & films", basePriceNuggets: 90,  paysDividend: true,  dividendDayOfWeek: 5, dividendPct: 0.0035, description: "Dysnei runs the most magical theme parks on Earth and makes the animated movies everyone grows up with." },
  { symbol: "SWEET", name: "Sweet Street",         emoji: "🍭", industry: "Candy & sweets",      basePriceNuggets: 20,  paysDividend: true,  dividendDayOfWeek: 6, dividendPct: 0.005,  description: "Sweet Street creates all the lollies, gummies, and chocolates that fill every trick-or-treat bag." },
];
