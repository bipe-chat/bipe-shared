// Sealed reports across operators (docs/report-envelope.md, bipe-chat/bipe#697): the report categories, the
// sealing constants and the plain types, for Swift and Kotlin. The body events stay raw JSON on the platforms.
import { REPORT_INFO, REPORT_LIMITS, REPORT_VERSION, HPKE_SUITE } from "./reports.mjs";

const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const stringKey = (id, hint) => `bipe_report_category_${id}${hint ? "_hint" : ""}`;
const hex4 = (n) => `0x${n.toString(16).padStart(4, "0")}`;

export function generateReports(registry, language, header) {
  const cats = registry.categories;
  if (language === "swift") {
    const cases = cats.map((c) => `    case ${camel(c.id)} = "${c.id}"`).join("\n");
    const sw = (fn) => cats.map((c) => `        case .${camel(c.id)}: ${fn(c)}`).join("\n");
    return `${header}
import Foundation

/// Report categories (registries/report-categories.json, bipe-chat/bipe#697). The order is the order of the report sheet.
public nonisolated enum BipeReportCategory: String, CaseIterable, Codable, Sendable {
${cases}

    /// Charter target, in minutes, from the report's arrival to the operator's first action.
    public var firstActionMinutes: Int {
        switch self {
${sw((c) => c.firstActionMinutes)}
        }
    }

    /// An accredited trusted flagger may file this category.
    public var flaggerEligible: Bool {
        switch self {
${sw((c) => c.flaggerEligible)}
        }
    }

    public var title: String {
        switch self {
${sw((c) => `BipeStrings.${camel(stringKey(c.id, false).replace(/^bipe_/, ""))}`)}
        }
    }

    public var hint: String {
        switch self {
${sw((c) => `BipeStrings.${camel(stringKey(c.id, true).replace(/^bipe_/, ""))}`)}
        }
    }
}

/// Sealing constants of docs/report-envelope.md. HPKE is RFC 9180 base mode, single shot:
/// CryptoKit \`HPKE.Ciphersuite.Curve25519_SHA256_ChachaPoly\`.
public enum BipeReportSealing {
    public static let version = ${REPORT_VERSION}
    public static let kemId: UInt16 = ${hex4(HPKE_SUITE.kem)}
    public static let kdfId: UInt16 = ${hex4(HPKE_SUITE.kdf)}
    public static let aeadId: UInt16 = ${hex4(HPKE_SUITE.aead)}
    /// HPKE \`info\` per recipient.
    public static let operatorInfo = "${REPORT_INFO.operator}"
    public static let associacaoInfo = "${REPORT_INFO.associacao}"
    public static let maxReasonCharacters = ${REPORT_LIMITS.reasonChars}
    public static let maxEvents = ${REPORT_LIMITS.events}
    public static let maxContextEvents = ${REPORT_LIMITS.contextEvents}
    public static let maxMediaPerEvent = ${REPORT_LIMITS.mediaPerEvent}
    public static let maxBodyBytes = ${REPORT_LIMITS.bodyBytes}
}

public nonisolated enum BipeReportRecipient: String, Codable, Sendable {
    case \`operator\` = "operator"
    case associacao = "associacao"
}

public nonisolated enum BipeReporterType: String, Codable, Sendable {
    case user = "user"
    case flagger = "flagger"
}

/// The plain envelope. Its exact UTF-8 JSON bytes are the HPKE AAD and travel as \`SealedReport.envelope\`.
public nonisolated struct BipeReportEnvelope: Codable, Equatable, Sendable {
    public var v: Int
    public var reportId: String
    public var to: BipeReportRecipient
    public var kid: String
    public var category: BipeReportCategory
    public var targetOperator: String
    public var targetUser: String?
    public var targetRoom: String?
    public var reporter: BipeReporterType
    public var flaggerId: String?
    public var created: Int64

    enum CodingKeys: String, CodingKey {
        case v
        case reportId = "report_id"
        case to
        case kid
        case category
        case targetOperator = "target_operator"
        case targetUser = "target_user"
        case targetRoom = "target_room"
        case reporter
        case flaggerId = "flagger_id"
        case created
    }

    public init(reportId: String, to: BipeReportRecipient, kid: String, category: BipeReportCategory, targetOperator: String,
                targetUser: String? = nil, targetRoom: String? = nil, reporter: BipeReporterType = .user, flaggerId: String? = nil, created: Int64) {
        self.v = BipeReportSealing.version
        self.reportId = reportId
        self.to = to
        self.kid = kid
        self.category = category
        self.targetOperator = targetOperator
        self.targetUser = targetUser
        self.targetRoom = targetRoom
        self.reporter = reporter
        self.flaggerId = flaggerId
        self.created = created
    }
}

/// A report on the wire: base64url without padding for each field.
public nonisolated struct BipeSealedReport: Codable, Equatable, Sendable {
    public var v: Int
    public var envelope: String
    public var enc: String
    public var ct: String

    public init(envelope: String, enc: String, ct: String) {
        self.v = BipeReportSealing.version
        self.envelope = envelope
        self.enc = enc
        self.ct = ct
    }
}

/// An encrypted file of a reported message (the fields of its Matrix EncryptedFile).
public nonisolated struct BipeReportMedia: Codable, Equatable, Sendable {
    public var url: String
    public var key: String
    public var iv: String
    public var sha256: String

    public init(url: String, key: String, iv: String, sha256: String) {
        self.url = url
        self.key = key
        self.iv = iv
        self.sha256 = sha256
    }
}
`;
  }
  if (language !== "kotlin") throw new Error(`unsupported reports language: ${language}`);
  const upper = (id) => id.toUpperCase();
  const entries = cats.map((c) => `    @SerialName("${c.id}") ${upper(c.id)}("${c.id}", ${c.firstActionMinutes}, ${c.flaggerEligible}, R.string.${stringKey(c.id, false)}, R.string.${stringKey(c.id, true)}),`).join("\n");
  return `${header}
package chat.bipe.shared.generated

import chat.bipe.shared.R
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Report categories (registries/report-categories.json, bipe-chat/bipe#697). The order is the order of the report sheet. */
@Serializable
enum class BipeReportCategory(
    val id: String,
    /** Charter target, in minutes, from the report's arrival to the operator's first action. */
    val firstActionMinutes: Int,
    /** An accredited trusted flagger may file this category. */
    val flaggerEligible: Boolean,
    val titleRes: Int,
    val hintRes: Int,
) {
${entries}
    ;

    companion object {
        fun fromId(id: String): BipeReportCategory? = entries.firstOrNull { it.id == id }
    }
}

/** Sealing constants of docs/report-envelope.md. HPKE is RFC 9180 base mode, single shot (Tink: DHKEM_X25519_HKDF_SHA256, HKDF_SHA256, CHACHA20_POLY1305). */
object BipeReportSealing {
    const val VERSION = ${REPORT_VERSION}
    const val KEM_ID = ${hex4(HPKE_SUITE.kem)}
    const val KDF_ID = ${hex4(HPKE_SUITE.kdf)}
    const val AEAD_ID = ${hex4(HPKE_SUITE.aead)}
    /** HPKE info per recipient. */
    const val OPERATOR_INFO = "${REPORT_INFO.operator}"
    const val ASSOCIACAO_INFO = "${REPORT_INFO.associacao}"
    const val MAX_REASON_CHARACTERS = ${REPORT_LIMITS.reasonChars}
    const val MAX_EVENTS = ${REPORT_LIMITS.events}
    const val MAX_CONTEXT_EVENTS = ${REPORT_LIMITS.contextEvents}
    const val MAX_MEDIA_PER_EVENT = ${REPORT_LIMITS.mediaPerEvent}
    const val MAX_BODY_BYTES = ${REPORT_LIMITS.bodyBytes}
}

@Serializable
enum class BipeReportRecipient {
    @SerialName("operator") OPERATOR,
    @SerialName("associacao") ASSOCIACAO,
}

@Serializable
enum class BipeReporterType {
    @SerialName("user") USER,
    @SerialName("flagger") FLAGGER,
}

/** The plain envelope. Its exact UTF-8 JSON bytes are the HPKE AAD and travel as [BipeSealedReport.envelope]. */
@Serializable
data class BipeReportEnvelope(
    /** Always [BipeReportSealing.VERSION]. No default: kotlinx.serialization leaves default values out of the JSON. */
    val v: Int,
    @SerialName("report_id") val reportId: String,
    val to: BipeReportRecipient,
    val kid: String,
    val category: BipeReportCategory,
    @SerialName("target_operator") val targetOperator: String,
    @SerialName("target_user") val targetUser: String? = null,
    @SerialName("target_room") val targetRoom: String? = null,
    val reporter: BipeReporterType,
    @SerialName("flagger_id") val flaggerId: String? = null,
    val created: Long,
)

/** A report on the wire: base64url without padding for each field. */
@Serializable
data class BipeSealedReport(
    val v: Int,
    val envelope: String,
    val enc: String,
    val ct: String,
)

/** An encrypted file of a reported message (the fields of its Matrix EncryptedFile). */
@Serializable
data class BipeReportMedia(
    val url: String,
    val key: String,
    val iv: String,
    val sha256: String,
)
`;
}
