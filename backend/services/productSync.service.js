const axios = require('axios')
const AskevaConfig = require('../models/AskevaConfig.model')
const AskevaCatalog = require('../models/AskevaCatalog.model')
const Product = require('../models/Product.model')
const { decrypt } = require('../utils/encryption.util')

/**
 * Step 1: Fetch active catalogs and store in AskevaCatalog collection.
 * Step 2: For each catalog, fetch its products and store in Product collection.
 */
const syncProducts = async (companyId) => {
    try {
        const config = await AskevaConfig.findOne({ companyId }).select('+apiKey').lean()
        if (!config || !config.apiKey) {
            console.warn(`[Sync] Skipping company ${companyId}: No API key found.`)
            return { success: false, error: 'Askeva configuration not found or API key missing.' }
        }

        const token = decrypt(config.apiKey)
        const backendUrl = config.backendUrl || 'https://backend.askeva.io'

        // ── Step 1: Fetch active catalogs ────────────────────────────────────
        console.log(`[Sync] Fetching active catalogs for company ${companyId}...`)
        const catalogUrl = `${backendUrl}/v1/commerce/catalogs?status=active&token=${encodeURIComponent(token)}`
        const catalogResponse = await axios.get(catalogUrl)

        let catalogs = []
        if (Array.isArray(catalogResponse.data)) {
            catalogs = catalogResponse.data
        } else if (catalogResponse.data && Array.isArray(catalogResponse.data.data)) {
            catalogs = catalogResponse.data.data
        } else if (catalogResponse.data && Array.isArray(catalogResponse.data.catalogs)) {
            catalogs = catalogResponse.data.catalogs
        }

        if (catalogs.length === 0) {
            console.log(`[Sync] No active catalogs found for company ${companyId}.`)
            return { success: true, catalogCount: 0, productCount: 0 }
        }

        // ── Step 2: Store each catalog in AskevaCatalog collection ───────────
        let catalogCount = 0
        const activeCatalogIds = []

        for (const c of catalogs) {
            const cid = c.catalogId || c.id || c._id
            if (!cid) continue

            await AskevaCatalog.findOneAndUpdate(
                { companyId, catalogId: String(cid) },
                {
                    companyId,
                    catalogId: String(cid),
                    name: c.name || c.title || '',
                    status: c.status || 'active',
                    rawResponse: c,
                    lastSyncedAt: new Date(),
                },
                { upsert: true, new: true }
            )
            activeCatalogIds.push(String(cid))
            catalogCount++
        }

        console.log(`[Sync] Stored ${catalogCount} catalogs for company ${companyId}.`)

        // ── Step 3: For each catalog, fetch and store its products ────────────
        let totalProductCount = 0

        for (const cid of activeCatalogIds) {
            console.log(`[Sync] Fetching products for catalog ${cid}...`)
            const productUrl = `${backendUrl}/v1/commerce/products/${cid}?token=${encodeURIComponent(token)}`

            try {
                const productResponse = await axios.get(productUrl)

                let products = []
                if (Array.isArray(productResponse.data)) {
                    products = productResponse.data
                } else if (productResponse.data && Array.isArray(productResponse.data.products)) {
                    products = productResponse.data.products
                } else if (productResponse.data && Array.isArray(productResponse.data.data)) {
                    products = productResponse.data.data
                }

                for (const p of products) {
                    const pid = p.id || p.product_id || p.productId || p.item_id || p._id
                    if (!pid) continue

                    await Product.findOneAndUpdate(
                        { companyId, productId: String(pid) },
                        {
                            companyId,
                            catalogId: cid,
                            productId: String(pid),
                            name: p.name || p.title || 'No Name',
                            description: p.description || p.desc || '',
                            price: p.price || p.sale_price || 0,
                            category: p.category || p.category_name || p.type || 'General',
                            imageUrl: p.image_url || p.imageUrl || p.thumb || p.defaultImage || '',
                            sku: p.sku || '',
                            isAvailable: p.is_available !== false && p.stock !== 0,
                            rawResponse: p,
                            lastSyncedAt: new Date(),
                        },
                        { upsert: true, new: true }
                    )
                    totalProductCount++
                }

                console.log(`[Sync] Synced ${products.length} products for catalog ${cid}.`)
            } catch (productError) {
                console.error(`[Sync] Failed to fetch products for catalog ${cid}:`, productError.message)
                if (productError.response) {
                    console.error(`[Sync] API response:`, productError.response.status, productError.response.data)
                }
                // Continue to next catalog even if one fails
            }
        }

        console.log(`[Sync] Completed for company ${companyId}: ${catalogCount} catalogs, ${totalProductCount} products.`)
        await AskevaConfig.updateOne({ companyId }, { lastSyncedAt: new Date() })

        return { success: true, catalogCount, productCount: totalProductCount }
    } catch (error) {
        console.error(`[Sync] Error syncing for company ${companyId}:`, error.message)
        if (error.response) {
            console.error(`[Sync] API response error:`, error.response.status, error.response.data)
        }
        return { success: false, error: error.message }
    }
}

/**
 * Runs the sync for all enabled companies
 */
const syncAllCompanies = async () => {
    try {
        const configs = await AskevaConfig.find({ isEnabled: true }).select('companyId')
        if (configs.length === 0) {
            console.log('[Sync] No enabled Askeva configurations found.')
            return
        }

        for (const config of configs) {
            await syncProducts(config.companyId)
        }
    } catch (error) {
        console.error('[Sync] Error in batch sync job:', error.message)
    }
}

module.exports = {
    syncProducts,
    syncAllCompanies,
}
