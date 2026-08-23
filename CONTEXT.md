# pi-decision-router

Routes Pi questions and confirmations to a child decision agent so unattended runs never stall on human input.

## Language

**Router Mode**:
The attended/unattended mode of the whole extension. One switch that turns routing and auto-compaction on or off together.
_Avoid_: enabled flag, toggle state

**Persisted Mode**:
The Router Mode remembered for a project directory across sessions. Restored at session start when no explicit environment override exists.
_Avoid_: saved config, cached settings

**Precedence Chain**:
The resolution order for startup mode: explicit environment variable, then Persisted Mode, then default ON.
_Avoid_: override order, config priority

**Decision Request**:
A structured choice delegated to the child decision agent instead of a waiting human.
_Avoid_: question routing, auto answer
