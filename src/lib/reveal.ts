import { useEffect } from 'react'

const TARGETS = '.reveal:not(.is-visible), .reveal-stagger:not(.is-visible)'

/**
 * Scroll-reveal: elements marked `reveal` (or `reveal-stagger`, whose
 * children animate in sequence) get `is-visible` the first time they enter
 * the viewport; the CSS does the animation. A MutationObserver picks up
 * elements rendered later (route changes, wallet or directory loading).
 * Without IntersectionObserver everything is shown at once.
 */
export function useScrollReveal(): void {
  useEffect(() => {
    const show = (element: Element) => element.classList.add('is-visible')

    if (typeof IntersectionObserver === 'undefined') {
      const showAll = () => document.querySelectorAll(TARGETS).forEach(show)
      showAll()
      const mutations = new MutationObserver(showAll)
      mutations.observe(document.body, { childList: true, subtree: true })
      return () => mutations.disconnect()
    }

    const intersections = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          show(entry.target)
          intersections.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    )
    const observeAll = () => document.querySelectorAll(TARGETS).forEach((element) => intersections.observe(element))
    observeAll()
    const mutations = new MutationObserver(observeAll)
    mutations.observe(document.body, { childList: true, subtree: true })
    return () => {
      mutations.disconnect()
      intersections.disconnect()
    }
  }, [])
}
