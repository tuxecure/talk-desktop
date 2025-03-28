/**
 * SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type {
	PredefinedUserStatus,
	UserStatusBackup,
	UserStatusPrivate,
	UserStatusPublic,
} from './userStatus.types.ts'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { emit, subscribe } from '@nextcloud/event-bus'
import { getCurrentUser } from '@nextcloud/auth'
import {
	fetchAllPredefinedStatuses,
	fetchCurrentUserStatus,
	revertToBackupStatus,
	heartbeatUserStatus,
	updateUserStatus,
	fetchBackupStatus,
} from './userStatus.service.ts'

declare module '@nextcloud/event-bus' {
	interface NextcloudEvents {
		'user_status:status.updated': UserStatusPublic
	}
}

/**
 * Cache the user status in local storage
 *
 * @param userStatus - User status
 */
function cacheUserStatus(userStatus: UserStatusPrivate) {
	localStorage.setItem('TalkDesktop:userStatus', JSON.stringify(userStatus))
}

/**
 * Restore the user status from local storage
 */
function restoreUserStatus(): UserStatusPrivate | null {
	// @ts-expect-error - JSON parse type is invalid in lib.ts, `null` is a valid value to parse
	return JSON.parse(localStorage.getItem('TalkDesktop:userStatus'))
}

/**
 * Cache the predefined statuses in local storage
 *
 * @param predefinedStatuses - Predefined statuses
 */
function cachePredefinedStatuses(predefinedStatuses: PredefinedUserStatus[]) {
	localStorage.setItem('TalkDesktop:predefinedStatuses', JSON.stringify(predefinedStatuses))
}

/**
 * Restore the predefined statuses from local storage
 */
function restorePredefinedStatuses(): PredefinedUserStatus[] | null {
	// @ts-expect-error - JSON parse type is invalid in lib.ts, `null` is a valid value to parse
	return JSON.parse(localStorage.getItem('TalkDesktop:predefinedStatuses'))
}

/**
 * Emit the user status update event
 *
 * @param userStatus - User status
 */
function emitUserStatusUpdated(userStatus: UserStatusPublic) {
	emit('user_status:status.updated', {
		status: userStatus.status,
		message: userStatus.message,
		icon: userStatus.icon,
		clearAt: userStatus.clearAt,
		userId: userStatus.userId,
	})
}

export const useUserStatusStore = defineStore('userStatus', () => {
	const userStatus = ref<UserStatusPrivate | null>(null)
	const predefinedStatuses = ref<PredefinedUserStatus[] | null>(restorePredefinedStatuses())
	const backupStatus = ref<UserStatusBackup | null>(null)

	const isDnd = computed(() => userStatus.value?.status === 'dnd')

	subscribe('user_status:status.updated', (newUserStatus) => {
		if (newUserStatus.userId === getCurrentUser()!.uid) {
			patchUserStatus(newUserStatus, false)
		}
	})

	// Restore the user status from cache
	const cachedStatus = restoreUserStatus()
	if (cachedStatus) {
		setUserStatus(cachedStatus, true)
	}

	watch(userStatus, (newUserStatus) => cacheUserStatus(newUserStatus!), { deep: true })

	const initPromise = (async () => {
		await updateUserStatusWithHeartbeat(false, true)

		predefinedStatuses.value = await fetchAllPredefinedStatuses()
		cachePredefinedStatuses(predefinedStatuses.value)
	})()

	/**
	 * Set the user status
	 *
	 * @param newUserStatus - New user status
	 * @param withEmit - Whether to emit the update event
	 */
	function setUserStatus(newUserStatus: UserStatusPrivate, withEmit: boolean = true) {
		userStatus.value = newUserStatus
		backupStatus.value = null
		if (withEmit) {
			emitUserStatusUpdated(userStatus.value)
		}
	}

	/**
	 * Patch the user status
	 *
	 * @param newUserStatus - New user status
	 * @param withEmit - Whether to emit the update event
	 */
	function patchUserStatus(newUserStatus: Partial<UserStatusPrivate>, withEmit: boolean = true) {
		Object.assign(userStatus.value!, newUserStatus)
		backupStatus.value = null
		if (withEmit) {
			emitUserStatusUpdated(userStatus.value!)
		}
	}

	/**
	 * Save the user status
	 *
	 * @param newUserStatus - New user status
	 */
	async function saveUserStatus(newUserStatus: UserStatusPrivate) {
		try {
			const newUserStatusDto = { ...newUserStatus }
			await updateUserStatus(userStatus.value!, newUserStatusDto)
			setUserStatus(newUserStatus)
			return true
		} catch {
			return false
		}
	}

	/**
	 * Revert the user status from the backup
	 */
	async function revertUserStatusFromBackup() {
		await revertToBackupStatus(userStatus.value!.messageId!)
		setUserStatus(await fetchCurrentUserStatus())
		backupStatus.value = null
	}

	/**
	 * Update the user status with a heartbeat
	 *
	 * @param isAway - Whether the user is away
	 * @param forceFetchStatus - Whether to force fetch the current status
	 */
	async function updateUserStatusWithHeartbeat(isAway: boolean, forceFetchStatus: boolean = false) {
		const status = await heartbeatUserStatus(isAway)

		if (status) {
			setUserStatus(status)
			backupStatus.value = await fetchBackupStatus(getCurrentUser()!.uid).catch(() => null)
		} else if (forceFetchStatus) {
			// heartbeat returns the status only if it has changed
			// Request explicitly if forced to fetch status
			setUserStatus(await fetchCurrentUserStatus())
			backupStatus.value = await fetchBackupStatus(getCurrentUser()!.uid).catch(() => null)
		}
	}

	return {
		initPromise,
		userStatus,
		isDnd,
		predefinedStatuses,
		backupStatus,
		saveUserStatus,
		revertUserStatusFromBackup,
		updateUserStatusWithHeartbeat,
	}
})
