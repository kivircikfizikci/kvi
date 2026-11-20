import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as AlertPrimitive from '@radix-ui/react-alert-dialog'
import { X } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { clsx } from 'clsx'

export const Button=({className,variant='default',...p}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'default'|'secondary'|'ghost'|'danger'})=><button className={clsx('btn',`btn-${variant}`,className)} {...p}/>
export const Input=({className,...p}:InputHTMLAttributes<HTMLInputElement>)=><input className={clsx('input',className)} {...p}/>
export const NativeSelect=({className,...p}:SelectHTMLAttributes<HTMLSelectElement>)=><select className={clsx('input select',className)} {...p}/>
export const Badge=({children,tone='muted'}:{children:ReactNode;tone?:'muted'|'green'|'amber'|'red'|'blue'})=><span className={`badge badge-${tone}`}>{children}</span>
export const Modal=({open,onOpenChange,title,children,wide=false}:{open:boolean;onOpenChange:(v:boolean)=>void;title:string;children:ReactNode;wide?:boolean})=><DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="overlay"/><DialogPrimitive.Content className={clsx('modal',wide&&'modal-wide')}><div className="modal-head"><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Close asChild><Button variant="ghost" aria-label="Close"><X size={18}/></Button></DialogPrimitive.Close></div>{children}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
export const Confirm=({open,onOpenChange,title,description,onConfirm}:{open:boolean;onOpenChange:(v:boolean)=>void;title:string;description:string;onConfirm:()=>void})=><AlertPrimitive.Root open={open} onOpenChange={onOpenChange}><AlertPrimitive.Portal><AlertPrimitive.Overlay className="overlay"/><AlertPrimitive.Content className="modal confirm"><AlertPrimitive.Title>{title}</AlertPrimitive.Title><AlertPrimitive.Description>{description}</AlertPrimitive.Description><div className="actions"><AlertPrimitive.Cancel asChild><Button variant="secondary">Cancel</Button></AlertPrimitive.Cancel><AlertPrimitive.Action asChild><Button variant="danger" onClick={onConfirm}>Confirm</Button></AlertPrimitive.Action></div></AlertPrimitive.Content></AlertPrimitive.Portal></AlertPrimitive.Root>
