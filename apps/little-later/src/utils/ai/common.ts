// =====================================================
// Supporting Types
// =====================================================

export interface Availability {
	available: boolean;
	reason?: string;
}

export interface DestroyableModel {
	destroy?(): void | Promise<void>;
}

// =====================================================
// Utility and Global Integration
// =====================================================

export type CreateMonitorCallback = (status: {
	progress?: number;
	message?: string;
}) => void;
