# Change Safety Protocol

Before modifying existing behaviour:

1. Identify the affected feature and expected result.
2. Identify every relevant component, route, API, database table, service, test, integration and dependency.
3. Identify downstream effects, trust boundaries and data risks.
4. Write a short implementation and verification plan.
5. Make the smallest safe change.
6. Test the affected feature.
7. Test relevant adjacent behaviour.
8. Check console, build, type and runtime errors where applicable.
9. Check for regressions and update affected documentation.
10. Record evidence before proceeding to the next change.

If the request conflicts with existing architecture or business logic, do not silently change either. Explain what conflicts, why, what may break, the safest option and the recommendation. Continue only within the user's authority.
