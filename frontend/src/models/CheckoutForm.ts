import { z } from 'zod'
import validator from 'validator'
import * as bookcarsTypes from ':bookcars-types'
import { strings as commonStrings } from '@/lang/common'

const baseSchema = z.object({
    // Driver details
    fullName: z.string().optional(),
    email: z.string().refine((value) => !value || validator.isEmail(value), {
        message: commonStrings.EMAIL_NOT_VALID,
    }).optional(),
    phone: z.string().refine((value) => !value || validator.isMobilePhone(value), {
        message: commonStrings.PHONE_NOT_VALID,
    }).optional(),
    tos: z.boolean().refine((val) => val, {
        message: commonStrings.TOS_ERROR,
    }).optional(),

    // Payment options
    payLater: z.boolean().default(false).optional(),
    payDeposit: z.boolean().default(false).optional(),
    payInFull: z.boolean().default(false).optional(),

    // Booking options
    cancellation: z.boolean().default(false).optional(),
    amendments: z.boolean().default(false).optional(),
    theftProtection: z.boolean().default(false).optional(),
    collisionDamageWaiver: z.boolean().default(false).optional(),
    fullInsurance: z.boolean().default(false).optional(),
    additionalDriver: z.boolean().default(false).optional(),

    // Additional driver details
    additionalDriverFullName: z.string().optional(),
    additionalDriverEmail: z.string()
        .refine((value) => !value || validator.isEmail(value), {
            message: commonStrings.EMAIL_NOT_VALID,
        }).optional(),
    additionalDriverPhone: z
        .string()
        .refine((value) => !value || validator.isMobilePhone(value), {
            message: commonStrings.PHONE_NOT_VALID,
        }).optional(),
})

/**
 * Checkout no longer collects date of birth. The legacy car.minimumAge rule is
 * intentionally not enforced in the payment form; it must be represented by a
 * separate driver/license eligibility authority before production closure.
 */
export const createSchema = (_car?: bookcarsTypes.Car) => baseSchema

export type FormFields = z.infer<ReturnType<typeof createSchema>>
