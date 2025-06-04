// 🔹 Immutable color map for consistent usage across the bot

/**
 * @readonly
 * @enum {number}
 */
const COLOUR_VALUES = Object.freeze({
    ADD: "#00FF00",      // ✅ Green for adding events
    REMOVE: "#FF0000",   // ✅ Red for removing events
    EDIT: "#FFA500",     // ✅ Orange for editing/updating events
    WARNING: "#FFFF00",  // ✅ Yellow for warnings or alerts
    DEFAULT: "#FFFFFF"   // ✅ White as the fallback color
});

export default COLOUR_VALUES;