// Backward-compat shim — re-exports from the default bundle.
// Production code should use useActiveBundle() or import from bundles/.
export {
  CHAPTERS,
  ALL_CARDS,
  cardImages,
  cardAudios,
  getCardById,
  getChapterCards,
  getTotalCards,
} from './bundles/es-de-buenos-aires';
