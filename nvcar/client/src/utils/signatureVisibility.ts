export type SignatureStatusOptions = {
    signature?: any
    finalSignature?: any
    history?: any[]
    promotions?: any[]
    studentLevel?: string | null
    blockLevel?: string | null
    includeDirectLevelMatch?: boolean
    useFinalSignature?: boolean
    useSignatureAsFinal?: boolean
}

export type SignatureStatusResult = {
    isSignedStandard: boolean
    isSignedFinal: boolean
}

export const computeSignatureStatusForBlock = (opts: SignatureStatusOptions): SignatureStatusResult => {
    const {
        signature,
        finalSignature,
        history,
        promotions,
        studentLevel,
        blockLevel,
        includeDirectLevelMatch = false,
        useFinalSignature = true,
        useSignatureAsFinal = false
    } = opts

    let isSignedStandard = false
    let isSignedFinal = false

    if (blockLevel && studentLevel && String(studentLevel) === String(blockLevel)) {
        if (signature) isSignedStandard = true
        if (useFinalSignature && finalSignature) isSignedFinal = true
        if (useSignatureAsFinal && signature) isSignedFinal = true
    }

    if (!isSignedStandard || !isSignedFinal) {
        const sigHistory = Array.isArray(history) ? history : []
        const promoHistory = Array.isArray(promotions) ? promotions : []

        sigHistory.forEach((sig: any) => {
            if (sig?.schoolYearName) {
                const promo = promoHistory.find((p: any) => p.year === sig.schoolYearName)
                if (promo && promo.from === blockLevel) {
                    if (sig.type === 'standard' || !sig.type) isSignedStandard = true
                    if (sig.type === 'end_of_year') isSignedFinal = true
                }
            }

            if (includeDirectLevelMatch && sig?.level && sig.level === blockLevel) {
                if (sig.type === 'standard' || !sig.type) isSignedStandard = true
                if (sig.type === 'end_of_year') isSignedFinal = true
            }
        })
    }

    return { isSignedStandard, isSignedFinal }
}
