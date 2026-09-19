import re

with open('components/DetailedAttendanceModal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# The extra hanging code starts exactly after the end of the newly inserted block:
start_str = "        )}\n                 colors={colors}\n               />"
end_str = "           </View>\n        )}\n"
start_idx = content.find(start_str)
end_idx = content.find(end_str, start_idx)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx + 10] + content[end_idx + len(end_str):]
    with open('components/DetailedAttendanceModal.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
