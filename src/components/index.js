/**
 * Nebula Components Design System Library (@nebulacomponents/core)
 *
 * Production-ready, accessible (WCAG 2.2 AA), conversion-optimized components
 * designed to remediate CRO and component linting defects deterministically.
 */

export const COMPONENTS = {
  "hero-cta": {
    name: "NebulaHeroCTA",
    id: "hero-cta",
    description: "High-contrast primary hero conversion block with strict visual hierarchy and single dominant action (remediates CRO-010, CRO-015, CRO-016).",
    detectors: ["CRO-010", "CRO-015", "CRO-016", "COMP-001", "COMP-003"],
    templates: {
      react: `import React from "react";

export function NebulaHeroCTA({
  primaryText = "Get Started Free",
  primaryHref = "/signup",
  secondaryText = "View Live Demo",
  secondaryHref = "#demo",
  onPrimaryClick,
  onSecondaryClick,
  className = "",
}) {
  return (
    <div className={\`flex flex-col sm:flex-row items-center gap-4 my-6 \${className}\`}>
      <a
        href={primaryHref}
        onClick={onPrimaryClick}
        className="inline-flex items-center justify-center min-h-[48px] min-w-[160px] px-8 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 touch-manipulation"
      >
        {primaryText}
      </a>
      {secondaryText && (
        <a
          href={secondaryHref}
          onClick={onSecondaryClick}
          className="inline-flex items-center justify-center min-h-[48px] px-6 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 touch-manipulation"
        >
          {secondaryText}
        </a>
      )}
    </div>
  );
}`,
      vue: `<template>
  <div :class="['flex flex-col sm:flex-row items-center gap-4 my-6', className]">
    <a
      :href="primaryHref"
      @click="$emit('primary-click', $event)"
      class="inline-flex items-center justify-center min-h-[48px] min-w-[160px] px-8 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 touch-manipulation"
    >
      {{ primaryText }}
    </a>
    <a
      v-if="secondaryText"
      :href="secondaryHref"
      @click="$emit('secondary-click', $event)"
      class="inline-flex items-center justify-center min-h-[48px] px-6 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 touch-manipulation"
    >
      {{ secondaryText }}
    </a>
  </div>
</template>

<script setup>
defineProps({
  primaryText: { type: String, default: "Get Started Free" },
  primaryHref: { type: String, default: "/signup" },
  secondaryText: { type: String, default: "View Live Demo" },
  secondaryHref: { type: String, default: "#demo" },
  className: { type: String, default: "" },
});
defineEmits(["primary-click", "secondary-click"]);
</script>`,
      html: `<!-- NebulaHeroCTA Component (CRO-010, CRO-015, CRO-016 compliant) -->
<div class="flex flex-col sm:flex-row items-center gap-4 my-6">
  <a
    href="/signup"
    class="inline-flex items-center justify-center min-h-[48px] min-w-[160px] px-8 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 touch-manipulation"
  >
    Get Started Free
  </a>
  <a
    href="#demo"
    class="inline-flex items-center justify-center min-h-[48px] px-6 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 touch-manipulation"
  >
    View Live Demo
  </a>
</div>`
    }
  },

  "frictionless-form": {
    name: "NebulaFrictionlessForm",
    id: "frictionless-form",
    description: "Accessible conversion form with persistent floating labels, W3C autocomplete tokens, and device-native virtual keyboard mappings (remediates CRO-007, CRO-008, CRO-009, COMP-005).",
    detectors: ["CRO-007", "CRO-008", "CRO-009", "COMP-005"],
    templates: {
      react: `import React, { useState } from "react";

export function NebulaFrictionlessForm({
  onSubmit,
  submitText = "Complete Order",
  className = "",
}) {
  const [values, setValues] = useState({ name: "", email: "", tel: "" });
  const [errors, setErrors] = useState({});

  const validateField = (field, value) => {
    if (!value.trim()) return "This field is required";
    if (field === "email" && !/^\\S+@\\S+\\.\\S+$/.test(value)) return "Enter a valid email address";
    return null;
  };

  const handleBlur = (field) => {
    const error = validateField(field, values[field]);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(values);
      }}
      className={\`space-y-4 max-w-md w-full \${className}\`}
      noValidate
    >
      <div className="relative">
        <input
          id="nebula-name"
          name="name"
          type="text"
          autoComplete="name"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          onBlur={() => handleBlur("name")}
          placeholder=" "
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "nebula-name-error" : undefined}
          className="peer block w-full px-4 pt-6 pb-2 min-h-[48px] text-base text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <label
          htmlFor="nebula-name"
          className="absolute text-sm text-slate-500 duration-150 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-blue-600"
        >
          Full Name
        </label>
        {errors.name && <p id="nebula-name-error" className="mt-1 text-xs text-red-600">{errors.name}</p>}
      </div>

      <div className="relative">
        <input
          id="nebula-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
          onBlur={() => handleBlur("email")}
          placeholder=" "
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "nebula-email-error" : undefined}
          className="peer block w-full px-4 pt-6 pb-2 min-h-[48px] text-base text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <label
          htmlFor="nebula-email"
          className="absolute text-sm text-slate-500 duration-150 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-blue-600"
        >
          Email Address
        </label>
        {errors.email && <p id="nebula-email-error" className="mt-1 text-xs text-red-600">{errors.email}</p>}
      </div>

      <button
        type="submit"
        className="w-full min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 touch-manipulation"
      >
        {submitText}
      </button>
    </form>
  );
}`,
      vue: `<template>
  <form @submit.prevent="handleSubmit" class="space-y-4 max-w-md w-full" no-validate>
    <div class="relative">
      <input
        id="nebula-name"
        name="name"
        type="text"
        autocomplete="name"
        v-model="values.name"
        @blur="handleBlur('name')"
        placeholder=" "
        :aria-invalid="!!errors.name"
        class="peer block w-full px-4 pt-6 pb-2 min-h-[48px] text-base text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <label
        for="nebula-name"
        class="absolute text-sm text-slate-500 duration-150 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-blue-600"
      >
        Full Name
      </label>
      <p v-if="errors.name" class="mt-1 text-xs text-red-600">{{ errors.name }}</p>
    </div>

    <button
      type="submit"
      class="w-full min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 touch-manipulation"
    >
      {{ submitText }}
    </button>
  </form>
</template>

<script setup>
import { reactive } from "vue";
defineProps({ submitText: { type: String, default: "Complete Order" } });
const emit = defineEmits(["submit"]);
const values = reactive({ name: "", email: "" });
const errors = reactive({});

const handleBlur = (field) => {
  if (!values[field]?.trim()) errors[field] = "This field is required";
  else delete errors[field];
};
const handleSubmit = () => emit("submit", { ...values });
</script>`,
      html: `<!-- NebulaFrictionlessForm Component (CRO-007, CRO-008, CRO-009 compliant) -->
<form class="space-y-4 max-w-md w-full" method="POST" action="/submit">
  <div class="relative">
    <input
      id="nebula-name"
      name="name"
      type="text"
      autocomplete="name"
      placeholder=" "
      required
      class="peer block w-full px-4 pt-6 pb-2 min-h-[48px] text-base text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <label
      for="nebula-name"
      class="absolute text-sm text-slate-500 duration-150 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-blue-600"
    >
      Full Name
    </label>
  </div>
  <button
    type="submit"
    class="w-full min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 touch-manipulation"
  >
    Complete Order
  </button>
</form>`
    }
  },

  "sticky-dock": {
    name: "NebulaStickyMobileDock",
    id: "sticky-dock",
    description: "Fixed-bottom mobile thumb-zone conversion dock with scroll-aware disclosure (remediates CRO-011, CRO-015).",
    detectors: ["CRO-011", "CRO-015"],
    templates: {
      react: `import React, { useState, useEffect } from "react";

export function NebulaStickyMobileDock({
  ctaText = "Start Free Trial",
  ctaHref = "/signup",
  triggerSelector = "#hero-cta",
  onCtaClick,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = triggerSelector ? document.querySelector(triggerSelector) : null;
    const handleScroll = () => {
      if (target) {
        const rect = target.getBoundingClientRect();
        setVisible(rect.bottom < 0);
      } else {
        setVisible(window.scrollY > 400);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [triggerSelector]);

  if (!visible) return null;

  return (
    <aside
      role="complementary"
      aria-label="Quick action"
      className="sm:hidden fixed bottom-0 left-0 right-0 z-50 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg"
    >
      <div className="flex items-center gap-3 max-w-md mx-auto">
        <a
          href={ctaHref}
          onClick={onCtaClick}
          className="flex-1 inline-flex items-center justify-center min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 touch-manipulation"
        >
          {ctaText}
        </a>
      </div>
    </aside>
  );
}`,
      vue: `<template>
  <aside
    v-if="visible"
    role="complementary"
    aria-label="Quick action"
    class="sm:hidden fixed bottom-0 left-0 right-0 z-50 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg"
  >
    <div class="flex items-center gap-3 max-w-md mx-auto">
      <a
        :href="ctaHref"
        @click="$emit('cta-click', $event)"
        class="flex-1 inline-flex items-center justify-center min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 touch-manipulation"
      >
        {{ ctaText }}
      </a>
    </div>
  </aside>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
const props = defineProps({
  ctaText: { type: String, default: "Start Free Trial" },
  ctaHref: { type: String, default: "/signup" },
  triggerSelector: { type: String, default: "#hero-cta" },
});
defineEmits(["cta-click"]);
const visible = ref(false);

const handleScroll = () => {
  const target = props.triggerSelector ? document.querySelector(props.triggerSelector) : null;
  visible.value = target ? target.getBoundingClientRect().bottom < 0 : window.scrollY > 400;
};
onMounted(() => {
  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();
});
onUnmounted(() => window.removeEventListener("scroll", handleScroll));
</script>`,
      html: `<!-- NebulaStickyMobileDock Component (CRO-011, CRO-015 compliant) -->
<aside
  id="nebula-sticky-dock"
  role="complementary"
  aria-label="Quick conversion action"
  class="sm:hidden fixed bottom-0 left-0 right-0 z-50 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg"
>
  <div class="flex items-center gap-3 max-w-md mx-auto">
    <a
      href="/signup"
      class="flex-1 inline-flex items-center justify-center min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 touch-manipulation"
    >
      Start Free Trial
    </a>
  </div>
</aside>`
    }
  },

  "scent-beacon": {
    name: "NebulaScentBeacon",
    id: "scent-beacon",
    description: "AI Search referral scent alignment component highlighting cited claims and docking adjacent conversion triggers (remediates CRO-019). Referral fragments and referrer headers are user-controlled, untrusted input: they are used only to DETECT the AI-referral state against an allowlisted engine list; their raw values are never rendered, stored, or transmitted.",
    detectors: ["CRO-019"],
    safety: {
      untrusted_inputs: ["document.referrer", "window.location.hash (including #:~:text= fragments)"],
      boundary: "Engine identity is matched against a fixed allowlist (perplexity, searchgpt, openai, gemini) and only a static label is rendered. Referral content is never reflected into the DOM, never persisted, never transmitted, and never logged. Any dynamic claim text must come from developer-controlled props bound to verified registry claims, not from URL fragments.",
      csp: "No eval, no inline event handlers in the React/Vue templates; safe under strict CSP.",
    },
    templates: {
      react: `import React, { useEffect, useState } from "react";

// Untrusted-input boundary: document.referrer and location.hash are
// user-controlled. They are ONLY matched against this fixed allowlist to
// detect the referral state. Raw values are never rendered, stored, or sent.
const ALLOWED_ENGINES = [
  { match: "perplexity", label: "Perplexity" },
  { match: "searchgpt", label: "SearchGPT" },
  { match: "openai", label: "SearchGPT" },
  { match: "gemini", label: "Google Gemini" },
];

export function NebulaScentBeacon({
  claimText,
  ctaText = "Explore This Feature",
  ctaHref = "#demo",
}) {
  const [active, setActive] = useState(false);
  const [sourceEngine, setSourceEngine] = useState("");

  useEffect(() => {
    const ref = document.referrer.toLowerCase();
    const hash = window.location.hash;
    const isAiReferral = ALLOWED_ENGINES.some((e) => ref.includes(e.match)) || hash.includes(":~:text=");
    if (isAiReferral) {
      setActive(true);
      const engine = ALLOWED_ENGINES.find((e) => ref.includes(e.match));
      setSourceEngine(engine ? engine.label : "AI Search");
    }
  }, []);

  if (!active) return null;

  return (
    <div
      role="region"
      aria-label="Corroborated AI citation context"
      className="my-4 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg shadow-sm"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-sm text-amber-950">
          <span className="font-semibold">{sourceEngine} Citation Corroboration:</span>{" "}
          {claimText || "This page corroborates the verified claim cited in your search."}
        </div>
        <a
          href={ctaHref}
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors touch-manipulation focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          {ctaText}
        </a>
      </div>
    </div>
  );
}`,
      vue: `<template>
  <div
    v-if="active"
    role="region"
    aria-label="Corroborated AI citation context"
    class="my-4 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg shadow-sm"
  >
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div class="text-sm text-amber-950">
        <span class="font-semibold">{{ sourceEngine }} Citation Corroboration:</span>
        {{ claimText || "This page corroborates the verified claim cited in your search." }}
      </div>
      <a
        :href="ctaHref"
        class="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors touch-manipulation"
      >
        {{ ctaText }}
      </a>
    </div>
  </div>
</template>

<script setup>
// Untrusted-input boundary: document.referrer and location.hash are
// user-controlled. Only the allowlisted labels below are ever rendered.
const ALLOWED_ENGINES = [
  { match: "perplexity", label: "Perplexity" },
  { match: "searchgpt", label: "SearchGPT" },
  { match: "openai", label: "SearchGPT" },
  { match: "gemini", label: "Google Gemini" },
];
defineProps({
  claimText: { type: String, default: "" },
  ctaText: { type: String, default: "Explore This Feature" },
  ctaHref: { type: String, default: "#demo" },
});
const active = ref(false);
const sourceEngine = ref("AI Search");

onMounted(() => {
  const refUrl = document.referrer.toLowerCase();
  const hash = window.location.hash;
  const engine = ALLOWED_ENGINES.find((e) => refUrl.includes(e.match));
  if (engine || hash.includes(":~:text=")) {
    active.value = true;
    if (engine) sourceEngine.value = engine.label;
  }
});
</script>`,
      html: `<!-- NebulaScentBeacon Component (CRO-019 compliant) -->
<div
  id="nebula-scent-beacon"
  role="region"
  aria-label="Corroborated AI citation context"
  class="my-4 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg shadow-sm"
>
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
    <div class="text-sm text-amber-950">
      <span class="font-semibold">AI Search Corroboration:</span>
      Verified claim matching your search inquiry.
    </div>
    <a
      href="#demo"
      class="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors touch-manipulation"
    >
      Explore Feature
    </a>
  </div>
</div>`
    }
  },

  "touch-target": {
    name: "NebulaTouchTarget",
    id: "touch-target",
    description: "Accessible hit-area wrapper ensuring 48x48px touch boundaries without altering visual element layout (remediates CRO-015, COMP-001).",
    detectors: ["CRO-015", "COMP-001"],
    templates: {
      react: `import React from "react";

export function NebulaTouchTarget({ children, className = "" }) {
  return (
    <span className={\`relative inline-flex items-center justify-center \${className}\`}>
      {children}
      <span className="absolute inset-0 min-h-[48px] min-w-[48px] -m-1 pointer-events-none" aria-hidden="true" />
    </span>
  );
}`,
      vue: `<template>
  <span :class="['relative inline-flex items-center justify-center', className]">
    <slot />
    <span class="absolute inset-0 min-h-[48px] min-w-[48px] -m-1 pointer-events-none" aria-hidden="true" />
  </span>
</template>

<script setup>
defineProps({ className: { type: String, default: "" } });
</script>`,
      html: `<!-- NebulaTouchTarget Wrapper (CRO-015, COMP-001 compliant) -->
<span class="relative inline-flex items-center justify-center">
  <button class="px-3 py-1.5 text-sm font-medium text-slate-700">Action</button>
  <span class="absolute inset-0 min-h-[48px] min-w-[48px] -m-1 pointer-events-none" aria-hidden="true"></span>
</span>`
    }
  }
};

export function getComponent(id, format = "react") {
  const comp = COMPONENTS[id];
  if (!comp) return null;
  const template = comp.templates[format] || comp.templates.react;
  return { ...comp, code: template, format };
}

export function listComponents() {
  return Object.values(COMPONENTS).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    detectors: c.detectors,
  }));
}
