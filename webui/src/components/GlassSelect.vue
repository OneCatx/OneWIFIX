<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const root = ref(null)
const trigger = ref(null)
const menuStyle = ref({})

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? props.modelValue,
)

function updateMenuPosition() {
  const el = trigger.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  menuStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: 9999,
  }
}

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function select(value) {
  if (props.disabled || value === props.modelValue) {
    open.value = false
    return
  }
  emit('update:modelValue', value)
  open.value = false
}

function onKeydown(event) {
  if (props.disabled) return
  if (event.key === 'Escape') {
    open.value = false
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggle()
  }
}

function onClickOutside(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

function onScrollOrResize() {
  if (open.value) updateMenuPosition()
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updateMenuPosition()
})

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})
</script>

<template>
  <div
    ref="root"
    class="ob-glass-select"
    :class="{ 'is-open': open, 'is-disabled': disabled }"
  >
    <button
      ref="trigger"
      type="button"
      class="ob-glass-select__trigger"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="ob-glass-select__value">{{ selectedLabel }}</span>
      <span class="ob-glass-select__chevron" aria-hidden="true" />
    </button>
    <Teleport to="body">
      <ul
        v-if="open"
        class="ob-glass-select__menu"
        role="listbox"
        :aria-label="ariaLabel"
        :style="menuStyle"
      >
        <li
          v-for="opt in options"
          :key="opt.value"
          role="option"
          class="ob-glass-select__option"
          :class="{ 'is-selected': opt.value === modelValue }"
          :aria-selected="opt.value === modelValue"
          @click="select(opt.value)"
        >
          {{ opt.label }}
        </li>
      </ul>
    </Teleport>
  </div>
</template>
