# History import baseline

The monorepo was initialized on July 17, 2026 by rewriting fresh disposable
clones with a dependency-free `git filter-branch --index-filter` path-prefix
operation, then merging the two rewritten histories without squashing. The
source repositories were not rewritten.

Prefixing every historical path necessarily changed commit and tree IDs above
each application directory. The source tip tree itself remains unchanged as
the corresponding imported subtree, providing a byte-exact baseline check.

| Application | Source root | Source tip | Source tip tree | Imported root | Imported tip | Commits / merges | Path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Community | `cce53d97021bd0a632fc961605e5de49d13268df` | `d6a1d1876dbdd5f0959d43ea3c8a19ebf70334ac` | `7b02e953062c75e88d86fea4ffb9c63a6cc2c223` | `02d6b761be63d0c2f975b1afc07d3985b40d4599` | `4096326a40748e05a243d3f00568a0536ecd8dfa` | 359 / 51 | `apps/community` |
| Coalition | `f8e91125bc2b53cfa05de9cf911daf0b51ae5145` | `ffffec98878729658f96ddba6624c73b316279f6` | `26ff049ff9beaff22607b0e812b09b104c6be16a` | `90b5c68d114b51bbb962d5e473407eb20db9edc3` | `c2e4d9d526fed99a2842e0a2729cdff2395088cf` | 38 / 0 | `apps/coalition` |

The import merge is
`a676d085d0f90a3a93dee6da050cc8fca8497106`. Its first parent is the
Community tip and its second parent is the Coalition tip. At that commit the
combined history contains 398 commits, including 52 merge commits and the two
recorded roots above.

Community's existing release tags were retained with a `community/` namespace:

| Source tag | Source commit | Imported tag | Imported commit |
| --- | --- | --- | --- |
| `v0.0.1` | `7ad8d21d06a3d034532502a13158ab5594f890bd` | `community/v0.0.1` | `63d5a0678df40befe9442cc300e3697526d37566` |
| `v.0.1.1` | `600abdebcc4ae2c48ceaf4647401f429a7bf7e34` | `community/v.0.1.1` | `274632efd9190f03d62d9c975722d1a376504a47` |
| `v.0.1.2` | `f8dba54f46be4cc56808c9c74fb800571bb34303` | `community/v.0.1.2` | `b3e5862869d614d4e721d761806cf9400c75ed3a` |
| `v.0.2.0` | `8bdc7423692907cb6b26488a0d7ed89250927be0` | `community/v.0.2.0` | `5e9e2e11973bf462c4530c9830338bbb95a21372` |

Run the baseline verification from the repository root:

```bash
node scripts/verify-history-import.mjs
```

The check confirms the import parentage, roots, commit counts, namespaced tags,
path prefixes, and exact source-tree hashes at both imported tips. It verifies
the immutable import baseline rather than the current application trees, so
normal monorepo development does not invalidate it.

The source repositories remain the provenance and emergency rollback records:

- <https://github.com/paulbrigner/pgpz-community>
- <https://github.com/paulbrigner/pgpz-coalition>
