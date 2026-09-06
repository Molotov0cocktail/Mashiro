# 012 shared contract

Baseline 072dd39771e01b29bbced93f49e20a996f1e2cab. Trusted owner writes main/shared/preload and trusted tests; renderer owner writes renderer and renderer tests. Root writes task/program/progress and Git.

API is window.mashiro.reminders, types in src/shared/reminder-contract.ts. All calls use protocolVersion:1. query({assistantId,itemId?:UUID}) returns {records:ReminderRecord[], runtime:ReminderRuntime}; mutate({assistantId,commandId,mutation}) returns ReminderReceipt; operation({assistantId,commandId}) recovers the same receipt. configure({expectedVersion,policy,loginStartup}) and runtime({protocolVersion:1}) return ReminderRuntime. onChanged(listener) receives {kind:'changed'|'open-item',itemId:string|null}; changed refreshes list, open-item opens a freshly validated formal item.

ReminderRecord: id,itemId,itemVersion,version,dueAt (ISO with offset),timeZone (IANA),state ('SCHEDULED'|'RECOVERY_PENDING'|'DISPATCHING'|'DISPLAY_OBSERVED'|'RESULT_UNKNOWN'|'FAILED'|'EXPIRED'|'CANCELLED'|'HANDLED'),createdAt,updatedAt. It contains no copied item body. UI joins current item title through items API. Receipt: operationId,reminderId,reminderVersion,state ('SUCCEEDED'|'RESULT_UNKNOWN'|'CONFIRMED_NOT_APPLIED'),summary.

Mutation union: {action:'create',itemId,expectedItemVersion,dueAt,timeZone}; {action:'reschedule',id,expectedVersion,expectedItemVersion,dueAt,timeZone}; {action:'cancel'|'handle',id,expectedVersion}. Explicit reschedule creates a new occurrence version, including from UNKNOWN/FAILED. Repeating the identical commandId recovers receipt; content changes must receive a new commandId only after the prior outcome is known. After a transport failure retain command identity across remount and recover before retry.

Runtime: version,policy,loginStartup,loginStartupSupported,notificationSupported,runningInTray:true. Policy union {mode:'UNCONFIGURED'} | {mode:'EXPLICIT',catchUpMinutes:number,merge:boolean}. UNCONFIGURED is the only unapproved default: missed reminders become visible RECOVERY_PENDING; no automatic catchup. User may explicitly choose window 0..10080 minutes and merge. Login startup false initially and development unsupported; packaged adapter reports actual registration. UI states close hides to tray and explicit exit stops reminders.

Manual date input must produce an explicit offset instant and named time zone; trusted validates wall-clock/offset consistency and future time. Ambiguous conversational dates are not automatically saved; selected formal item plus precise explicit ISO time and time zone can execute the same stable reminder operation via items/items-memory tools. No proposal schedules and no due-date inference. Model fields never authorize.

All result envelopes {ok:true,data:T}|{ok:false,error:{code,message}}; codes INVALID_INPUT,NOT_FOUND,STALE_WRITE,PERMISSION_DENIED,CONFLICT,STORAGE_UNAVAILABLE,UNSUPPORTED. Strict Zod trusted schemas. Existing six assistant IPC unchanged.
