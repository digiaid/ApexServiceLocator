# CLAUDE.md — Apex Service Locator

## Project Overview

Apex Service Locator is a dependency resolution library for the Salesforce Force.com platform. It implements the Service Locator design pattern, enabling loose coupling by programming against interfaces rather than concrete classes. The library supports multiple resolution strategies: explicit runtime mappings, custom metadata configuration, and naming conventions.

**Author:** Mike Lockett
**Language:** Apex (Salesforce)
**API Version:** 44.0 (Salesforce DX)

## Repository Structure

```
ApexServiceLocator/
├── CLAUDE.md                          # This file
├── README.md                          # Project documentation and usage examples
├── sfdx-project.json                  # Salesforce DX project configuration
├── .gitignore
└── force-app/main/default/
    ├── classes/
    │   ├── ServiceLocator.cls         # Core library (210 lines)
    │   ├── Initable.cls               # Interface for parameterized init
    │   └── ServiceLocator_Test.cls    # Test suite (8 test methods)
    ├── customMetadata/
    │   └── LocatorConfig.ServiceLocator_MyTest1.md-meta.xml
    ├── objects/
    │   └── LocatorConfig__mdt/        # Custom metadata type definition
    │       ├── fields/
    │       │   ├── InterfaceName__c.field-meta.xml
    │       │   ├── ClassName__c.field-meta.xml
    │       │   └── IsActive__c.field-meta.xml
    │       └── listViews/
    └── layouts/
```

## Architecture

### Resolution Priority (first match wins)

1. **Instance override map** — `overwriteObjectMap()` returns a specific pre-built instance (used for mocking)
2. **Type override map** — `overwriteMap()` creates a new instance of the overridden class type
3. **Custom metadata** — Queries `LocatorConfig__mdt` records where `IsActive__c = true`
4. **Naming convention** — Strips the `I` prefix from interface name (e.g., `IMyThing` → `MyThing`)
5. **Direct instantiation** — Attempts to instantiate the interface name as a concrete class
6. **Exception** — Throws `ServiceLocator.MapException` if none of the above resolve

### Key Classes

| Class | Purpose |
|---|---|
| `ServiceLocator` | Core class with static methods for dependency resolution |
| `Initable` | Interface for classes that need parameterized initialization via `init(Map<String, Object>)` |
| `ServiceLocator_Test` | Full test suite |

### Custom Metadata Type: `LocatorConfig__mdt`

| Field | Type | Description |
|---|---|---|
| `InterfaceName__c` | Text(80) | Fully qualified interface name (e.g., `ServiceLocator.IMyTest`) |
| `ClassName__c` | Text(80) | Fully qualified concrete class name (e.g., `ServiceLocator.MyTest1`) |
| `IsActive__c` | Checkbox | Enables/disables the mapping (default: true) |

### Custom Exceptions

- `ServiceLocator.MapException` — Interface cannot be resolved to any concrete class
- `ServiceLocator.InterfaceNameException` — String-based lookup provided a name that doesn't correspond to a valid type

## Code Conventions

### Naming

- **Classes:** PascalCase (`ServiceLocator`, `MyTest1`)
- **Interfaces:** PascalCase with `I` prefix (`IMyTest`, `IMyOtherTest`)
- **Methods:** camelCase (`getInstance`, `overwriteMap`)
- **Variables:** camelCase (`overwrittenMap`, `hitInit`)
- **Custom Fields:** PascalCase with `__c` suffix (`InterfaceName__c`, `IsActive__c`)
- **Custom Metadata Types:** PascalCase with `__mdt` suffix (`LocatorConfig__mdt`)
- **Test classes:** `<ClassName>_Test` (e.g., `ServiceLocator_Test`)

### Style

- Classes use `with sharing` for data access security
- All core methods are `public static`
- Javadoc-style comments on public methods with `@author`, `@date`, `@param`, `@return`, `@throws`, `@example`
- Test interfaces and inner classes are embedded in `ServiceLocator` for testing (custom metadata cannot be created in Apex tests)

## Testing

### Framework

Standard Salesforce Apex test framework using `@IsTest` annotations. No external test dependencies.

### Running Tests

Tests are deployed and run via Salesforce DX:
```bash
sfdx force:apex:test:run -n ServiceLocator_Test -r human
```

Or via the Salesforce org's Developer Console / Setup UI.

### Test Methods (8 total)

| Method | What it tests |
|---|---|
| `getInstance_ReturnsCorrectInstance` | Basic Type-based resolution via custom metadata |
| `getInstanceString_ReturnsCorrectInstance` | String-based resolution |
| `getInstanceWithNoMatch_ThrowsServiceLocatorMapException` | MapException for unmapped interfaces |
| `getInstanceWithNoInterface_ThrowsServiceLocatorInterfaceNameException` | InterfaceNameException for invalid names |
| `getInstanceString_ReturnsCorrectInstanceAndCallsInit` | Parameterized init via `Initable` |
| `overWriteMapWorks` | Runtime type override |
| `locateBy_conventionWorks` | Convention-based resolution (I-prefix stripping) |
| `overWriteObjectMapWorks` | Instance override (for mocking) |

### Test Data

Test interfaces and implementations are defined as inner classes in `ServiceLocator.cls` because custom metadata records cannot be inserted during Apex tests. A single custom metadata record (`LocatorConfig.ServiceLocator_MyTest1`) maps `ServiceLocator.IMyTest` → `ServiceLocator.MyTest1`.

## Build & Deploy

This is a Salesforce DX project. There is no local build step — code is deployed to a Salesforce org.

```bash
# Deploy to a connected org
sfdx force:source:deploy -p force-app

# Push to a scratch org
sfdx force:source:push
```

### Configuration

- `sfdx-project.json` defines the package directory (`force-app`) and source API version (`44.0`)
- No namespace is configured
- No CI/CD pipelines are set up

## Dependencies

**None.** This is a standalone library with no external dependencies.

**Optional integration:** [FinancialForce ApexMocks Framework](https://github.com/financialforcedev/fflib-apex-mocks) — can be used with `overwriteObjectMap()` for advanced mocking in tests (example commented out in test file).

## Common Tasks

### Adding a new interface-to-class mapping

1. Create your interface and implementing class
2. Add a `LocatorConfig__mdt` custom metadata record with `InterfaceName__c`, `ClassName__c`, and `IsActive__c = true`
3. Or rely on the `I`-prefix naming convention (no configuration needed)

### Overriding resolution in tests

```apex
// Override with a different class type
ServiceLocator.overwriteMap(IMyService.class, MyMockService.class);

// Override with a specific instance (e.g., for ApexMocks)
ServiceLocator.overwriteObjectMap(IMyService.class, mockInstance);
```

### Adding parameterized initialization

1. Have your class implement both your interface and `Initable`
2. Implement the `init(Map<String, Object> params)` method
3. Call `ServiceLocator.getInstance(IMyInterface.class, paramsMap)`

## Important Notes

- All metadata XML files (`.cls-meta.xml`, `.field-meta.xml`, etc.) must accompany their corresponding source files
- The `profiles/` directory is excluded via `.gitignore`
- The library uses `System.debug()` statements for troubleshooting resolution — these are acceptable in this context
- Static maps (`overwrittenMap`, `overwrittenObjectMap`) reset between Apex transactions automatically
