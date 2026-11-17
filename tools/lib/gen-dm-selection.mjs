// ADR 0141. The registry fixes eligibility/order; SDK adapters supply local candidates.
export function generateDmSelection(registry, language, header) {
  if (registry.order !== "latest-event-descending" || registry.tieBreak !== "room-id-ascending") throw new Error("unsupported DM selection policy");
  if (language === "swift") return `${header}
import BipeCore

/// Local room facts for ADR 0141. Eligibility excludes left, invited and non-DM rooms. Clear markers stay separate.
public struct BipeDmCandidate: Equatable, Sendable {
    public let roomId: String
    public let peerUserId: String
    public let latestActivityMs: Int64?
    public let eligible: Bool
    public let cleared: Bool

    public init(roomId: String, peerUserId: String, latestActivityMs: Int64?, eligible: Bool, cleared: Bool = false) {
        self.roomId = roomId
        self.peerUserId = peerUserId
        self.latestActivityMs = latestActivityMs
        self.eligible = eligible
        self.cleared = cleared
    }
}

/// Same selected room in lists, unread/search results and Start chat. No network or room mutation. The rule runs in
/// bipe-core (newestDmRooms, bipe-chat/bipe#1475).
public enum BipeDmSelection {
    public static func newestRooms(_ candidates: [BipeDmCandidate], includingCleared: Bool = false) -> [String: String] {
        newestDmRooms(candidates: candidates.map {
            DmCandidate(roomId: $0.roomId, peerUserId: $0.peerUserId, eligible: $0.eligible, cleared: $0.cleared,
                        latestActivityMs: $0.latestActivityMs)
        }, includingCleared: includingCleared)
    }
}
`;
  if (language !== "kotlin") throw new Error(`unsupported DM selection language: ${language}`);
  return `${header}
package chat.bipe.shared.generated

import chat.bipe.core.DmCandidate
import chat.bipe.core.newestDmRooms

/** Local room facts for ADR 0141. Eligibility excludes left, invited and non-DM rooms. Clear markers stay separate. */
data class BipeDmCandidate(val roomId: String, val peerUserId: String, val latestActivityMs: Long?, val eligible: Boolean, val cleared: Boolean = false)

/** Same selected room in lists, unread/search results and Start chat. The rule runs in bipe-core (newestDmRooms, bipe-chat/bipe#1475). */
object BipeDmSelection {
    fun newestRooms(candidates: List<BipeDmCandidate>, includingCleared: Boolean = false): Map<String, String> =
        newestDmRooms(candidates.map { DmCandidate(it.roomId, it.peerUserId, it.eligible, it.cleared, it.latestActivityMs) }, includingCleared)
}
`;
}
