// Shared archive visibility and migration (bipe#662).
export function generateChatArchive(language, header, policy) {
  const source = language === "swift" ? `
public struct BipeArchiveDecision: Equatable, Sendable {
    public let marker: Int64?
    public let synced: Bool
    public let tagWrite: Bool?
}

public nonisolated enum BipeChatArchive {
    public static let echoGraceMs: Int64 = ${policy.echoGraceMs}
    private static func valid(_ value: Int64?) -> Bool { value.map { $0 >= 0 && $0 <= 9_007_199_254_740_991 } ?? false }
    public static func isArchived(marker: Int64?, incoming: Int64?) -> Bool {
        guard valid(marker), let marker else { return false }
        return !valid(incoming) || incoming! <= marker
    }
    public static func reconcile(marker: Int64?, synced: Bool, serverArchived: Bool, activity: Int64?, incoming: Int64?) -> BipeArchiveDecision {
        if valid(marker), let marker {
            if synced && !serverArchived { return BipeArchiveDecision(marker: nil, synced: false, tagWrite: nil) }
            if !isArchived(marker: marker, incoming: incoming) {
                return BipeArchiveDecision(marker: nil, synced: false, tagWrite: serverArchived ? false : nil)
            }
            return BipeArchiveDecision(marker: marker, synced: serverArchived, tagWrite: serverArchived ? nil : true)
        }
        let baseline = max(valid(activity) ? activity! : 0, valid(incoming) ? incoming! : 0)
        return BipeArchiveDecision(marker: serverArchived ? baseline : nil, synced: serverArchived, tagWrite: nil)
    }
}
` : language === "kotlin" ? `
package chat.bipe.shared.generated

data class BipeArchiveDecision(val marker: Long?, val synced: Boolean, val tagWrite: Boolean?)

object BipeChatArchive {
    const val echoGraceMs: Long = ${policy.echoGraceMs}L
    private fun valid(value: Long?): Boolean = value != null && value >= 0 && value <= 9_007_199_254_740_991L
    fun isArchived(marker: Long?, incoming: Long?): Boolean = valid(marker) && (!valid(incoming) || incoming!! <= marker!!)
    fun reconcile(marker: Long?, synced: Boolean, serverArchived: Boolean, activity: Long?, incoming: Long?): BipeArchiveDecision {
        if (valid(marker)) {
            if (synced && !serverArchived) return BipeArchiveDecision(null, false, null)
            if (!isArchived(marker, incoming)) return BipeArchiveDecision(null, false, if (serverArchived) false else null)
            return BipeArchiveDecision(marker, serverArchived, if (serverArchived) null else true)
        }
        val baseline = maxOf(if (valid(activity)) activity!! else 0L, if (valid(incoming)) incoming!! else 0L)
        return BipeArchiveDecision(if (serverArchived) baseline else null, serverArchived, null)
    }
}
` : null;
  if (!source) throw new Error("unsupported archive language");
  return header + source;
}
