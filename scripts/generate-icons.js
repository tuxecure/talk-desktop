/**
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const path = require('node:path')
const fs = require('node:fs/promises')
const icongen = require('icon-gen')

/* eslint-disable jsdoc/valid-types */

/**
 * Generate icons from a source SVG file in a specified format and sizes
 * @param {string} source - Source SVG file path
 * @param {`${string}.${'png'|'icns'|'ico'}`} filename - Output filename with extension
 * @param {number[]} sizes - Sizes of the icons (max two sizes are allowed for PNG to have @2x file)
 * @param {string} output - Output directory
 */
async function generate(source, filename, sizes, output) {
	const type = path.extname(filename).slice(1)
	const name = path.basename(filename, `.${type}`)

	if (type === 'ico' || type === 'icns') {
		return icongen(source, output, { [type]: { name, sizes } })
	}

	if (type === 'png') {
		if (sizes.length > 2) {
			throw new Error('Only two sizes are allowed for PNG')
		}

		// If icoSizes is not specified, icon-gen generates favicon.ico with default sizes
		// And it fails if there was no PNG in the same sizes
		// So it is required to generate favicon.ico with the same sized
		await icongen(source, output, {
			favicon: {
				name,
				pngSizes: sizes,
				icoSizes: sizes,
			},
		})

		// Remove unneeded favicon.ico
		await fs.unlink(path.join(output, 'favicon.ico'))
		// Rename name16.png -> name.png, name32.png -> name@2x.png
		await fs.rename(path.join(output, `${name}${sizes[0]}.png`), path.join(output, `${name}.png`))
		if (sizes.length === 2) {
			await fs.rename(path.join(output, `${name}${sizes[1]}.png`), path.join(output, `${name}@2x.png`))
		}
	}
}

/**
 * Generate all icons from original SVGs
 *
 * @return {Promise<void>}
 */
async function generateIcons() {
	const output = path.join(__dirname, '../img/icons')

	/**
	 * Prepare output directory
	 */

	await fs.rm(output, { recursive: true })
	await fs.mkdir(output)

	/**
	 * Source icons
	 */

	const IconMain = path.join(__dirname, '../img/talk-icon-rounded.svg')
	const IconMac = path.join(__dirname, '../img/talk-icon-mac-shadow.svg')
	const IconPlainLight = path.join(__dirname, '../img/talk-icon-plain-light.svg')
	const IconPlainDark = path.join(__dirname, '../img/talk-icon-plain-dark.svg')

	/**
	 * Sizes
	 */

	const LINUX_ICON_SIZE = 512
	const MACOS_ICON_SIZES = [16, 32, 64, 128, 256, 512, 1024]
	const WINDOWS_ICON_SIZES = [16, 24, 32, 48, 256]
	const LINUX_TRAY_ICON_SIZE = [16, 32]
	const MACOS_TRAY_ICON_SIZES = [16, 32]

	/**
	 * App icons
	 */

	// Linux
	await generate(IconMain, 'icon.png', [LINUX_ICON_SIZE], output)
	// macOS
	await generate(IconMac, 'icon.icns', MACOS_ICON_SIZES, output)
	// Windows
	await generate(IconMain, 'icon.ico', WINDOWS_ICON_SIZES, output)

	/**
	 * Tray icons
	 */

	// Linux
	await generate(IconMain, 'IconTrayLinux.png', LINUX_TRAY_ICON_SIZE, output)
	await generate(IconPlainLight, 'IconTrayLinuxLight.png', LINUX_TRAY_ICON_SIZE, output)
	await generate(IconPlainDark, 'IconTrayLinuxDark.png', LINUX_TRAY_ICON_SIZE, output)
	// macOS
	await generate(IconMain, 'IconTrayMac.png', MACOS_TRAY_ICON_SIZES, output)
	await generate(IconPlainLight, 'IconTrayMacTemplate.png', MACOS_TRAY_ICON_SIZES, output)
	// Windows
	await generate(IconPlainLight, 'IconTrayWin32Light.ico', WINDOWS_ICON_SIZES, output)
	await generate(IconPlainDark, 'IconTrayWin32Dark.ico', WINDOWS_ICON_SIZES, output)
}

generateIcons()
	.then(() => console.log('✅ Done'))
	.catch((err) => console.error(err))
