import React, { useState } from 'react'
import {
  Button,
  CircularProgress,
  FormControl,
  FormHelperText,
  InputLabel,
  OutlinedInput,
} from '@mui/material'
import { createYapeInstrument } from '@em3rc0d/m-pago/yape'
import env from '@/config/env.config'
import * as MercadoPagoService from '@/services/MercadoPagoService'

interface YapePaymentProps {
  bookingId: string
  reservationSessionId: string
  idempotencyKey: string
  language: string
  onResult: (result: MercadoPagoService.MercadoPagoPaymentResponse) => void
  onError: (error: unknown) => void
}

const YapePayment = ({
  bookingId,
  reservationSessionId,
  idempotencyKey,
  language,
  onResult,
  onError,
}: YapePaymentProps) => {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [validationError, setValidationError] = useState(false)
  const es = language === 'es'

  const submit = async () => {
    const phone = phoneNumber.replace(/\D/g, '')
    const code = otp.replace(/\D/g, '')

    if (!/^\d{9,15}$/.test(phone) || !/^\d{6}$/.test(code) || !idempotencyKey) {
      setValidationError(true)
      return
    }

    setValidationError(false)
    setSubmitting(true)
    try {
      // Canonical m-pago boundary: phone + OTP go directly to Mercado Pago JS.
      // Mitos receives only the one-time tokenized Yape instrument.
      const instrument = await createYapeInstrument({
        publicKey: env.MERCADO_PAGO_PUBLIC_KEY,
        phoneNumber: phone,
        otp: code,
      })

      const result = await MercadoPagoService.createInstrumentPayment({
        bookingId,
        reservationSessionId,
        instrument,
        idempotencyKey,
      })

      // Clear sensitive one-time input as soon as tokenization/payment finishes.
      setPhoneNumber('')
      setOtp('')
      onResult(result)
    } catch (error) {
      onError(error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: '12px 0 4px' }}>
      <h3 style={{ marginTop: 0 }}>Yape</h3>

      <FormControl fullWidth margin="dense">
        <InputLabel>{es ? 'Número de celular' : 'Phone number'}</InputLabel>
        <OutlinedInput
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, '').slice(0, 15))}
          label={es ? 'Número de celular' : 'Phone number'}
          inputProps={{ inputMode: 'numeric', autoComplete: 'off' }}
        />
      </FormControl>

      <FormControl fullWidth margin="dense">
        <InputLabel>{es ? 'Código de aprobación (OTP)' : 'Approval code (OTP)'}</InputLabel>
        <OutlinedInput
          value={otp}
          onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
          label={es ? 'Código de aprobación (OTP)' : 'Approval code (OTP)'}
          inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code' }}
        />
        <FormHelperText>
          {es
            ? 'El celular y el OTP se envían únicamente a Mercado Pago para generar un token de un solo uso; Mitos no los guarda.'
            : 'Phone and OTP are sent only to Mercado Pago to create a one-time token; Mitos does not store them.'}
        </FormHelperText>
      </FormControl>

      {validationError && (
        <FormHelperText error>
          {es ? 'Ingresa un celular válido y un código OTP de 6 dígitos.' : 'Enter a valid phone number and a 6-digit OTP.'}
        </FormHelperText>
      )}

      <Button
        type="button"
        variant="contained"
        onClick={submit}
        disabled={submitting}
        style={{ marginTop: 12 }}
      >
        {submitting
          ? <CircularProgress color="inherit" size={22} />
          : (es ? 'Pagar con Yape' : 'Pay with Yape')}
      </Button>
    </div>
  )
}

export default YapePayment
