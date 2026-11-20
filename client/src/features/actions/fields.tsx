import { useId, type InputHTMLAttributes } from 'react'

export function Field({ label, type = 'text', required = true, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="field"><span>{label}</span><input type={type} required={required} {...props} /></label>
}

export function TextField({ label, name, required = true, defaultValue }: {
  label: string; name: string; required?: boolean; defaultValue?: string
}) {
  return <label className="field"><span>{label}</span><textarea name={name} maxLength={1600}
    required={required} defaultValue={defaultValue} /></label>
}

export type Option = [string | number, string]

export function SelectField({ label, name, options, defaultValue, value, onChange }: {
  label: string; name: string; options: Option[]; defaultValue?: string | number; value?: string;
  onChange?: (value: string) => void
}) {
  const labelId = useId()
  return <label className="field"><span id={labelId}>{label}</span><select name={name} aria-labelledby={labelId}
    required defaultValue={defaultValue} value={value}
    onChange={onChange && (event => onChange(event.target.value))}>
    {options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}
  </select></label>
}
