// Message rendering policy shared by the native HTML parsers (bipe#660).
export function generateMessageFormatting(policy, language, header, quote) {
  const arrays = ["safeSchemes", "dropContentTags", "boldTags", "italicTags", "strikeTags", "codeTags", "blockTags"];
  const strings = ["linkPattern", "phonePattern"];
  const numbers = ["maxHtmlLength", "maxDepth"];
  if (language === "swift") {
    return header + "\npublic nonisolated enum BipeMessageFormatting {\n" +
      arrays.map(k => "    public static let " + k + ": Set<String> = [" + policy[k].map(quote).join(", ") + "]\n").join("") +
      strings.map(k => "    public static let " + k + " = " + quote(policy[k]) + "\n").join("") +
      numbers.map(k => "    public static let " + k + " = " + policy[k] + "\n").join("") + "}\n";
  }
  if (language !== "kotlin") throw new Error("unsupported message-formatting language");
  return header + "\npackage chat.bipe.shared.generated\n\nobject BipeMessageFormatting {\n" +
    arrays.map(k => "    val " + k + ": Set<String> = setOf(" + policy[k].map(quote).join(", ") + ")\n").join("") +
    strings.map(k => "    const val " + k + " = " + quote(policy[k]) + "\n").join("") +
    numbers.map(k => "    const val " + k + " = " + policy[k] + "\n").join("") + "}\n";
}
