import importlib.util, unittest
from pathlib import Path
p=Path(__file__).resolve().parents[1]/"careernet-career-info/scripts/careernet_career_info.py"; s=importlib.util.spec_from_file_location("career",p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
class CareerTest(unittest.TestCase):
 def test_module_loads(self): self.assertTrue(callable(m.main))
if __name__=="__main__": unittest.main()
