// Mural home score (ADR 0246, bipe-chat/bipe#1044): Swift and Kotlin output. The formula is in registries/home-score.json,
// the reference is home-score.mjs, and test-vectors/home-score.json checks all of them. The score runs in bipe-core
// (home_score.rs, bipe-chat/bipe#1478); these wrappers keep the app API and the layout constants.

const percent = (x) => Math.floor(x * 100 + 0.5);

export function generateHomeScore(policy, language, header, quote) {
  return language === "swift" ? `${header}
import BipeCore
import Foundation

public nonisolated enum BipeHomeChatKind: String, Sendable {
    case person, company, group
}

public nonisolated enum BipeHomeReason: String, Sendable {
    case mention, unanswered
}

/// The explicit inputs of one chat. Pass joined, not archived chats only. Step 1 of ADR 0246 passes no model fields.
public nonisolated struct BipeHomeChat: Equatable, Sendable {
    public var id: String
    public var kind: BipeHomeChatKind
    public var hasSeal: Bool
    public var official: Bool
    public var favourite: Bool
    public var muted: Bool
    public var mentioned: Bool
    public var unreadCount: Int
    public var lastFromOther: Bool
    /// nil: the time of the latest event is unknown.
    public var minutesSinceActivity: Int?
    public var messagesPerWeek: Int
    public var trustWarning: Bool
    public var modelAttention: String?
    public var modelDue: Bool

    public init(
        id: String,
        kind: BipeHomeChatKind,
        hasSeal: Bool = false,
        official: Bool = false,
        favourite: Bool = false,
        muted: Bool = false,
        mentioned: Bool = false,
        unreadCount: Int = 0,
        lastFromOther: Bool = false,
        minutesSinceActivity: Int? = nil,
        messagesPerWeek: Int = 0,
        trustWarning: Bool = false,
        modelAttention: String? = nil,
        modelDue: Bool = false
    ) {
        self.id = id
        self.kind = kind
        self.hasSeal = hasSeal
        self.official = official
        self.favourite = favourite
        self.muted = muted
        self.mentioned = mentioned
        self.unreadCount = unreadCount
        self.lastFromOther = lastFromOther
        self.minutesSinceActivity = minutesSinceActivity
        self.messagesPerWeek = messagesPerWeek
        self.trustWarning = trustWarning
        self.modelAttention = modelAttention
        self.modelDue = modelDue
    }
}

public nonisolated struct BipeHomeScored: Equatable, Sendable {
    public let scorePercent: Int
    public let reason: BipeHomeReason?
    public var score: Double { Double(scorePercent) / 100.0 }
}

public nonisolated struct BipeHomeTile: Equatable, Sendable {
    public let id: String
    public let scorePercent: Int
    /// nil: no tile. The chat is only in the plain list.
    public let tier: Int?
    public let reason: BipeHomeReason?
    public var score: Double { Double(scorePercent) / 100.0 }
}

public nonisolated struct BipeHomeTierRule: Equatable, Sendable {
    public let tier: Int
    public let minPercent: Int
    /// nil: no limit.
    public let maxChats: Int?
    /// nil: avatars only, in rows that wrap.
    public let columns: Int?
}

/// Source: bipe-shared/registries/home-score.json, which holds the formula.
public nonisolated enum BipeHomeScore {
    public static let tiers: [BipeHomeTierRule] = [
${policy.tiers.map((t) => `        BipeHomeTierRule(tier: ${t.tier}, minPercent: ${percent(t.minScore)}, maxChats: ${t.maxChats ?? "nil"}, columns: ${t.columns ?? "nil"}),`).join("\n")}
    ]
    public static let messagesPerWeekWindowDays = ${policy.tie.windowDays}
    public static let firstTileMessages = ${policy.tile.firstTileMessages}
    public static let secondTileMessages = ${policy.tile.secondTileMessages}
    public static let tier2Bubbles = ${policy.tile.tier2Bubbles}
    public static let tier3TextLines = ${policy.tile.tier3TextLines}
    public static let gistMaxLength = ${policy.model.gistMaxLength}
    public static let dueMaxLength = ${policy.model.dueMaxLength}
    public static let draftMaxLength = ${policy.model.draftMaxLength}

    private static func core(_ chat: BipeHomeChat) -> HomeChat {
        let kind: HomeChatKind = switch chat.kind {
        case .person: .person
        case .company: .company
        case .group: .group
        }
        return HomeChat(
            id: chat.id, kind: kind, hasSeal: chat.hasSeal, official: chat.official, favourite: chat.favourite,
            muted: chat.muted, mentioned: chat.mentioned, unreadCount: Int64(chat.unreadCount),
            lastFromOther: chat.lastFromOther, minutesSinceActivity: chat.minutesSinceActivity.map { Int64($0) },
            messagesPerWeek: Int64(chat.messagesPerWeek), trustWarning: chat.trustWarning,
            modelAttention: chat.modelAttention, modelDue: chat.modelDue
        )
    }

    private static func reason(_ reason: HomeReason?) -> BipeHomeReason? {
        reason.map { $0 == .mention ? .mention : .unanswered }
    }

    public static func score(_ chat: BipeHomeChat) -> BipeHomeScored {
        let scored = homeScore(chat: core(chat))
        return BipeHomeScored(scorePercent: Int(scored.scorePercent), reason: reason(scored.reason))
    }

    /// The tiles in screen order.
    public static func plan(_ chats: [BipeHomeChat]) -> [BipeHomeTile] {
        homePlan(chats: chats.map(core)).map { tile in
            BipeHomeTile(id: tile.id, scorePercent: Int(tile.scorePercent), tier: tile.tier.map { Int($0) }, reason: reason(tile.reason))
        }
    }
}
` : language === "kotlin" ? `${header}
package chat.bipe.shared.generated

import chat.bipe.core.HomeChat
import chat.bipe.core.HomeChatKind
import chat.bipe.core.HomeReason
import chat.bipe.core.homePlan
import chat.bipe.core.homeScore

enum class BipeHomeChatKind { PERSON, COMPANY, GROUP }

enum class BipeHomeReason { MENTION, UNANSWERED }

/** The explicit inputs of one chat. Pass joined, not archived chats only. Step 1 of ADR 0246 passes no model fields. */
data class BipeHomeChat(
    val id: String,
    val kind: BipeHomeChatKind,
    val hasSeal: Boolean = false,
    val official: Boolean = false,
    val favourite: Boolean = false,
    val muted: Boolean = false,
    val mentioned: Boolean = false,
    val unreadCount: Int = 0,
    val lastFromOther: Boolean = false,
    /** null: the time of the latest event is unknown. */
    val minutesSinceActivity: Int? = null,
    val messagesPerWeek: Int = 0,
    val trustWarning: Boolean = false,
    val modelAttention: String? = null,
    val modelDue: Boolean = false,
)

data class BipeHomeScored(val scorePercent: Int, val reason: BipeHomeReason?) {
    val score: Double get() = scorePercent / 100.0
}

/** tier null: no tile. The chat is only in the plain list. */
data class BipeHomeTile(val id: String, val scorePercent: Int, val tier: Int?, val reason: BipeHomeReason?) {
    val score: Double get() = scorePercent / 100.0
}

/** maxChats null: no limit. columns null: avatars only, in rows that wrap. */
data class BipeHomeTierRule(val tier: Int, val minPercent: Int, val maxChats: Int?, val columns: Int?)

/** Source: bipe-shared/registries/home-score.json, which holds the formula. */
object BipeHomeScore {
    val tiers: List<BipeHomeTierRule> = listOf(
${policy.tiers.map((t) => `        BipeHomeTierRule(${t.tier}, ${percent(t.minScore)}, ${t.maxChats ?? "null"}, ${t.columns ?? "null"}),`).join("\n")}
    )
    const val MESSAGES_PER_WEEK_WINDOW_DAYS = ${policy.tie.windowDays}
    const val FIRST_TILE_MESSAGES = ${policy.tile.firstTileMessages}
    const val SECOND_TILE_MESSAGES = ${policy.tile.secondTileMessages}
    const val TIER2_BUBBLES = ${policy.tile.tier2Bubbles}
    const val TIER3_TEXT_LINES = ${policy.tile.tier3TextLines}
    const val GIST_MAX_LENGTH = ${policy.model.gistMaxLength}
    const val DUE_MAX_LENGTH = ${policy.model.dueMaxLength}
    const val DRAFT_MAX_LENGTH = ${policy.model.draftMaxLength}

    private fun core(chat: BipeHomeChat) = HomeChat(
        id = chat.id,
        kind = when (chat.kind) {
            BipeHomeChatKind.PERSON -> HomeChatKind.PERSON
            BipeHomeChatKind.COMPANY -> HomeChatKind.COMPANY
            BipeHomeChatKind.GROUP -> HomeChatKind.GROUP
        },
        hasSeal = chat.hasSeal,
        official = chat.official,
        favourite = chat.favourite,
        muted = chat.muted,
        mentioned = chat.mentioned,
        unreadCount = chat.unreadCount.toLong(),
        lastFromOther = chat.lastFromOther,
        minutesSinceActivity = chat.minutesSinceActivity?.toLong(),
        messagesPerWeek = chat.messagesPerWeek.toLong(),
        trustWarning = chat.trustWarning,
        modelAttention = chat.modelAttention,
        modelDue = chat.modelDue,
    )

    private fun reason(reason: HomeReason?): BipeHomeReason? = when (reason) {
        HomeReason.MENTION -> BipeHomeReason.MENTION
        HomeReason.UNANSWERED -> BipeHomeReason.UNANSWERED
        null -> null
    }

    fun score(chat: BipeHomeChat): BipeHomeScored =
        homeScore(core(chat)).let { BipeHomeScored(it.scorePercent, reason(it.reason)) }

    fun plan(chats: List<BipeHomeChat>): List<BipeHomeTile> =
        homePlan(chats.map(::core)).map { BipeHomeTile(it.id, it.scorePercent, it.tier?.toInt(), reason(it.reason)) }
}
` : null;
}
