import { ToolUse } from "@core/assistant-message"
import type { ToolResponse } from "../../types/ToolResponse"

export interface Edit {
	anchor: string
	end_anchor?: string
	edit_type: "replace" | "insert_after" | "insert_before" | "delete"
	text: string
}

export interface FileEdit {
	path: string
	edits: Edit[]
}

export interface ResolvedEdit {
	lineIdx: number
	endIdx: number
	edit: Edit
	editIndex: number
}

export interface FailedEdit {
	edit: Edit
	error: string
	editIndex: number
}

export interface AppliedEdit {
	startIdx: number
	endIdx: number
	originalStartIdx: number
	originalEndIdx: number
	edit: Edit
	linesAdded: number
	linesDeleted: number
}

export interface PreparedEdits {
	content: string
	finalContent: string
	diff: string
	resolvedEdits: ResolvedEdit[]
	failedEdits: FailedEdit[]
	appliedEdits: AppliedEdit[]
	lines: string[]
	lineHashes: string[]
	finalLines: string[]
	displayPath: string
	fileIndex: number
}

export interface PreparedFileBatch {
	wasStringified?: boolean
	absolutePath: string
	displayPath: string
	prepared?: PreparedEdits
	blocks: ToolUse[]
	error?: ToolResponse
	diagnostics?: { fixedCount: number; newProblemsMessage: string }
}
