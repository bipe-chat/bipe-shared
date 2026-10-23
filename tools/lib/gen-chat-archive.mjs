// Canonical archive visibility, shared by the two native clients.
export function generateChatArchive(language, header) {
  if (language === "swift") return `${header}
public nonisolated enum BipeChatArchive {
    public static func isArchived(marker: Int64?, incoming: Int64?) -> Bool {
        guard let marker, marker >= 0 else { return false }
        return incoming.map { $0 <= marker } ?? true
    }
}
`;
  if (language !== "kotlin") throw new Error("unsupported archive language");
  return `${header}
package io.element.android.libraries.bipe.generated

object BipeChatArchive {
    fun isArchived(marker: Long?, incoming: Long?): Boolean =
        marker != null && marker >= 0 && (incoming == null || incoming <= marker)
}
`;
}
